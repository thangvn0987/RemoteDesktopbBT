// RemoteBT Helper - server/client for input control with token auth (TCP)
// Restored after accidental file wipe. Adds better error logging.
#ifdef _WIN32
#  define WIN32_LEAN_AND_MEAN
#  define NOMINMAX
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  include <windows.h>
#  include <objidl.h> // IStream
#  include <gdiplus.h>
#  pragma comment(lib, "Gdiplus.lib")
#  pragma comment(lib, "Ws2_32.lib")
#else
#  error "Windows only prototype"
#endif

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <mutex>

using namespace std::chrono_literals;

static void sleep_ms(int ms){ std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

// ---------------- Utility ----------------
static std::vector<std::string> split_ws(const std::string &line){ std::istringstream iss(line); std::vector<std::string> out; std::string w; while(iss>>w) out.push_back(w); return out; }
static std::wstring utf8_to_wide(const std::string &s){ if(s.empty()) return L""; int len=MultiByteToWideChar(CP_UTF8,0,s.c_str(),-1,nullptr,0); std::wstring w; w.resize(len?len-1:0); if(len>0) MultiByteToWideChar(CP_UTF8,0,s.c_str(),-1,w.data(),len); return w; }
static std::string join_from(const std::vector<std::string>&v,size_t i){ std::string o; for(size_t k=i;k<v.size();++k){ if(k>i) o.push_back(' '); o+=v[k]; } return o; }

// ---------------- Input (Win32) ----------------
// Virtual desktop geometry (may include negative origin when multiple monitors)
static int g_vx = 0, g_vy = 0, g_vw = 0, g_vh = 0;
// Track last MOVE coordinates (in virtual desktop coordinates)
static std::atomic<int> g_lastX{0};
static std::atomic<int> g_lastY{0};

static void mouse_move_abs(int x,int y){ SetCursorPos(x,y); }
static void mouse_move_virtual(int x,int y){ SetCursorPos(x + g_vx, y + g_vy); }
static void mouse_btn(const std::string &btn,bool down){ std::string b=btn; for(char &c:b)c=(char)tolower(c); DWORD f=0; if(b=="left") f=down?MOUSEEVENTF_LEFTDOWN:MOUSEEVENTF_LEFTUP; else if(b=="right") f=down?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_RIGHTUP; else if(b=="middle") f=down?MOUSEEVENTF_MIDDLEDOWN:MOUSEEVENTF_MIDDLEUP; if(!f) return; INPUT in{}; in.type=INPUT_MOUSE; in.mi.dwFlags=f; SendInput(1,&in,sizeof(INPUT)); }
static void mouse_click(const std::string &btn){ mouse_btn(btn,true); sleep_ms(10); mouse_btn(btn,false); }
static void mouse_scroll(int delta){ INPUT in{}; in.type=INPUT_MOUSE; in.mi.dwFlags=MOUSEEVENTF_WHEEL; in.mi.mouseData=delta; SendInput(1,&in,sizeof(INPUT)); }
static WORD vk_from_name(const std::string &name){
	std::string n=name; for(char &c:n)c=(char)tolower(c);
	if(n=="enter"||n=="return") return VK_RETURN;
	if(n=="esc"||n=="escape") return VK_ESCAPE;
	if(n=="backspace") return VK_BACK;
	if(n=="tab") return VK_TAB;
	if(n=="space"||n=="spacebar") return VK_SPACE;
	if(n=="ctrl"||n=="control") return VK_CONTROL;
	if(n=="alt") return VK_MENU;
	if(n=="shift") return VK_SHIFT;
	if(n=="meta"||n=="win"||n=="lwin") return VK_LWIN;
	if(n=="rwin") return VK_RWIN;
	if(n=="left") return VK_LEFT; if(n=="right") return VK_RIGHT; if(n=="up") return VK_UP; if(n=="down") return VK_DOWN;
	if(n.size()==1 && isalpha((unsigned char)n[0])) return (WORD)toupper(n[0]);
	if(n.size()==1 && isdigit((unsigned char)n[0])) return (WORD)(0x30 + (n[0]-'0'));
	if(n.size()>=2 && (n[0]=='f'||n[0]=='F')){ int f=std::atoi(n.c_str()+1); if(f>=1&&f<=24) return (WORD)(VK_F1+(f-1)); }
	return 0;
}
static bool is_extended_vk(WORD vk){
	switch(vk){
		case VK_INSERT: case VK_DELETE: case VK_HOME: case VK_END:
		case VK_PRIOR: /*PageUp*/ case VK_NEXT: /*PageDown*/
		case VK_LEFT: case VK_RIGHT: case VK_UP: case VK_DOWN:
		case VK_RMENU: case VK_RCONTROL: case VK_NUMLOCK: case VK_SNAPSHOT:
		case VK_DIVIDE: case VK_RWIN: case VK_LWIN: return true;
		default: return false;
	}
}
static void send_vk_down(WORD vk){
	// Prefer virtual-key injection (wVk) for better compatibility with standard apps
	INPUT in{}; in.type=INPUT_KEYBOARD; in.ki.wVk = vk;
	in.ki.wScan = (WORD)MapVirtualKey(vk, MAPVK_VK_TO_VSC);
	in.ki.dwFlags = (is_extended_vk(vk)? KEYEVENTF_EXTENDEDKEY:0);
	SendInput(1, &in, sizeof(in));
}
static void send_vk_up(WORD vk){
	INPUT in{}; in.type=INPUT_KEYBOARD; in.ki.wVk = vk;
	in.ki.wScan = (WORD)MapVirtualKey(vk, MAPVK_VK_TO_VSC);
	in.ki.dwFlags = KEYEVENTF_KEYUP | (is_extended_vk(vk)? KEYEVENTF_EXTENDEDKEY:0);
	SendInput(1, &in, sizeof(in));
}
static void press_vk(WORD vk){ send_vk_down(vk); send_vk_up(vk); }
static void type_text(const std::string &txt){ auto w=utf8_to_wide(txt); if(w.empty()) return; std::vector<INPUT> seq; seq.reserve(w.size()*2); for(auto ch: w){ INPUT d{}; d.type=INPUT_KEYBOARD; d.ki.wScan=ch; d.ki.dwFlags=KEYEVENTF_UNICODE; seq.push_back(d); INPUT u=d; u.ki.dwFlags=KEYEVENTF_UNICODE|KEYEVENTF_KEYUP; seq.push_back(u);} SendInput((UINT)seq.size(), seq.data(), sizeof(INPUT)); }
static void send_combo(const std::string &combo){
	std::string tmp; for(char c:combo) tmp.push_back(c=='+'?' ':c);
	auto parts=split_ws(tmp);
	std::vector<WORD> down;
	for(auto &p:parts){
		std::string n=p; for(char &c:n)c=(char)tolower(c);
		WORD vk=0; if(n=="ctrl") vk=VK_CONTROL; else if(n=="alt") vk=VK_MENU; else if(n=="shift") vk=VK_SHIFT; else vk=vk_from_name(p);
		if(vk){ send_vk_down(vk); down.push_back(vk);} }
	for(size_t i=0;i<down.size();++i){ WORD vk = down[down.size()-1-i]; send_vk_up(vk); }
}

// ---------------- Networking ----------------
struct Tcp { SOCKET s=INVALID_SOCKET; static bool init(){ WSADATA w; return WSAStartup(MAKEWORD(2,2),&w)==0; } static void done(){ WSACleanup(); } void close(){ if(s!=INVALID_SOCKET){ closesocket(s); s=INVALID_SOCKET; } } };
static bool tcp_listen(uint16_t port, Tcp &srv){ srv.s=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP); if(srv.s==INVALID_SOCKET) return false; sockaddr_in a{}; a.sin_family=AF_INET; a.sin_addr.s_addr=htonl(INADDR_ANY); a.sin_port=htons(port); int yes=1; setsockopt(srv.s,SOL_SOCKET,SO_REUSEADDR,(const char*)&yes,sizeof(yes)); if(bind(srv.s,(sockaddr*)&a,sizeof(a))!=0) return false; if(listen(srv.s,1)!=0) return false; return true; }
static bool tcp_accept(Tcp &srv, Tcp &cli){ cli.s=accept(srv.s,nullptr,nullptr); return cli.s!=INVALID_SOCKET; }
static bool tcp_connect(const std::string &host,uint16_t port, Tcp &cli){ cli.s=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP); if(cli.s==INVALID_SOCKET) return false; sockaddr_in a{}; a.sin_family=AF_INET; inet_pton(AF_INET,host.c_str(),&a.sin_addr); a.sin_port=htons(port); return connect(cli.s,(sockaddr*)&a,sizeof(a))==0; }
static int tcp_send(Tcp &c,const std::string &d){ return send(c.s,d.c_str(),(int)d.size(),0); }
static int tcp_recv(Tcp &c,char *buf,int cap){ return recv(c.s,buf,cap,0); }

// ---------------- Protocol ----------------
static std::string TOKEN="dev-secret";
// capture globals
static std::atomic<bool> g_capture{false};
static int g_capture_interval_ms = 1000;
static std::thread g_capture_thread;
static std::mutex g_send_mx;
static SOCKET g_client_sock = INVALID_SOCKET;

// base64 encoder
static const char* B64TAB = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static std::string base64_encode(const unsigned char* data, size_t len){
	std::string out; out.reserve(((len+2)/3)*4);
	for(size_t i=0;i<len;i+=3){ unsigned a=data[i]; unsigned b=(i+1<len)?data[i+1]:0; unsigned c=(i+2<len)?data[i+2]:0; out.push_back(B64TAB[(a>>2)&0x3F]); out.push_back(B64TAB[((a&0x3)<<4)|((b>>4)&0xF)]); out.push_back(i+1<len? B64TAB[((b&0xF)<<2)|((c>>6)&0x3)] : '='); out.push_back(i+2<len? B64TAB[c&0x3F] : '='); }
	return out;
}
static std::vector<unsigned char> base64_decode(const std::string &in){
	static int T[256]; static bool init=false; if(!init){ for(int i=0;i<256;++i) T[i]=-1; for(int i=0;i<64;++i) T[(unsigned char)B64TAB[i]]=i; init=true; }
	std::vector<unsigned char> out; int val=0, valb=-8; for(unsigned char c: in){ if(T[c]==-1){ if(c=='=') break; else continue; } val=(val<<6)+T[c]; valb+=6; if(valb>=0){ out.push_back((unsigned char)((val>>valb)&0xFF)); valb-=8; } } return out;
}

// Clipboard helpers (Unicode text only)
static bool set_clipboard_text_utf8(const std::string &txt){
	if(!OpenClipboard(nullptr)) return false; if(!EmptyClipboard()){ CloseClipboard(); return false; }
	std::wstring w = utf8_to_wide(txt); size_t bytes = (w.size()+1)*sizeof(wchar_t);
	HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, bytes); if(!hMem){ CloseClipboard(); return false; }
	wchar_t* ptr = (wchar_t*)GlobalLock(hMem); memcpy(ptr, w.c_str(), bytes); GlobalUnlock(hMem);
	SetClipboardData(CF_UNICODETEXT, hMem); CloseClipboard(); return true; }
static std::string get_clipboard_text_utf8(){ std::string out; if(!OpenClipboard(nullptr)) return out; HANDLE h = GetClipboardData(CF_UNICODETEXT); if(h){ wchar_t* w = (wchar_t*)GlobalLock(h); if(w){ size_t len=wcslen(w); int need = WideCharToMultiByte(CP_UTF8,0,w,(int)len,nullptr,0,nullptr,nullptr); out.resize(need); if(need>0) WideCharToMultiByte(CP_UTF8,0,w,(int)len,&out[0],need,nullptr,nullptr); GlobalUnlock(h);} } CloseClipboard(); return out; }

// Bring window under last pointer to the foreground to ensure it receives keystrokes
static void focus_window_under_last_pointer(){
	POINT pt{ g_lastX.load() + g_vx, g_lastY.load() + g_vy };
	HWND h = WindowFromPoint(pt);
	if(!h) return;
	HWND root = GetAncestor(h, GA_ROOT);
	if(!root) root = h;
	ShowWindow(root, SW_RESTORE);
	SetForegroundWindow(root);
	sleep_ms(10);
}

// capture screen to PNG (GDI+)
static bool get_png_bytes(std::vector<unsigned char>& out){
	// Use full virtual screen to avoid coordinate mismatch across monitors and DPI
	g_vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
	g_vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
	g_vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
	g_vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
	int w = g_vw; int h = g_vh;
	HDC hScreen = GetDC(nullptr); if(!hScreen) return false;
	HDC hMem = CreateCompatibleDC(hScreen); if(!hMem){ ReleaseDC(nullptr,hScreen); return false; }
	BITMAPINFO bmi{}; bmi.bmiHeader.biSize=sizeof(BITMAPINFOHEADER); bmi.bmiHeader.biWidth=w; bmi.bmiHeader.biHeight=-h; bmi.bmiHeader.biPlanes=1; bmi.bmiHeader.biBitCount=32; bmi.bmiHeader.biCompression=BI_RGB;
	void* bits=nullptr; HBITMAP hBmp = CreateDIBSection(hScreen, &bmi, DIB_RGB_COLORS, &bits, nullptr, 0); if(!hBmp){ DeleteDC(hMem); ReleaseDC(nullptr,hScreen); return false; }
	HGDIOBJ old = SelectObject(hMem, hBmp);
	// Copy from virtual desktop origin (can be negative)
	BitBlt(hMem, 0,0, w,h, hScreen, g_vx, g_vy, SRCCOPY|CAPTUREBLT);
	SelectObject(hMem, old);
	// GDI+ save to PNG memory stream
	Gdiplus::Bitmap bmp(hBmp, nullptr);
	CLSID clsidPng; UINT num=0, size=0; Gdiplus::GetImageEncodersSize(&num,&size);
	std::vector<BYTE> enc(size); Gdiplus::ImageCodecInfo* pInfo = reinterpret_cast<Gdiplus::ImageCodecInfo*>(enc.data());
	Gdiplus::GetImageEncoders(num, size, pInfo);
	for(UINT i=0;i<num;++i){ if(wcscmp(pInfo[i].MimeType, L"image/png")==0){ clsidPng = pInfo[i].Clsid; break; } }
	IStream* stream=nullptr; CreateStreamOnHGlobal(nullptr, TRUE, &stream);
	bmp.Save(stream, &clsidPng, nullptr);
	// extract bytes
	HGLOBAL hg; GetHGlobalFromStream(stream, &hg); SIZE_T sz = GlobalSize(hg); void* p = GlobalLock(hg);
	out.assign((unsigned char*)p, (unsigned char*)p + sz);
	GlobalUnlock(hg); stream->Release();
	DeleteObject(hBmp); DeleteDC(hMem); ReleaseDC(nullptr,hScreen);
	return !out.empty();
}

static void send_frame_over_tcp(const std::string &b64){
	if(g_client_sock==INVALID_SOCKET) return;
	std::lock_guard<std::mutex> lk(g_send_mx);
	std::string header = "FRAME "+std::to_string(b64.size())+"\n";
	send(g_client_sock, header.c_str(), (int)header.size(), 0);
	send(g_client_sock, b64.c_str(), (int)b64.size(), 0);
	const char nl='\n'; send(g_client_sock, &nl, 1, 0);
}

static void capture_loop(){
	while(g_capture){
		std::vector<unsigned char> png; if(get_png_bytes(png)){
			std::string b64 = base64_encode(png.data(), png.size());
			send_frame_over_tcp(b64);
		}
		sleep_ms(g_capture_interval_ms);
	}
}

static bool handle_command(const std::string &line, bool &authed){ auto parts=split_ws(line); if(parts.empty()) return true; std::string cmd=parts[0]; for(char &c:cmd)c=(char)tolower(c);
	if(cmd=="auth"){ if(parts.size()>=2 && parts[1]==TOKEN){ authed=true; std::cout<<"OK auth\n"; } else std::cout<<"ERR auth\n"; return true; }
	if(!authed){ std::cout<<"ERR need AUTH first\n"; return true; }
	if(cmd=="move" && parts.size()>=3){
		int x = std::stoi(parts[1]); int y = std::stoi(parts[2]);
		g_lastX.store(x); g_lastY.store(y);
		mouse_move_virtual(x, y);
		std::cout<<"OK\n"; return true; }
	if(cmd=="click" && parts.size()>=2){ mouse_click(parts[1]); std::cout<<"OK\n"; return true; }
	if(cmd=="down" && parts.size()>=2){ mouse_btn(parts[1],true); std::cout<<"OK\n"; return true; }
	if(cmd=="up" && parts.size()>=2){ mouse_btn(parts[1],false); std::cout<<"OK\n"; return true; }
	if(cmd=="scroll" && parts.size()>=2){ mouse_scroll(std::stoi(parts[1])); std::cout<<"OK\n"; return true; }
	if(cmd=="type" && parts.size()>=2){
		// Ensure target window focused by synthetic click at current cursor location
		POINT pt; if(GetCursorPos(&pt)){ mouse_click("left"); }
		auto text=line.substr(line.find(' ')+1);
		type_text(text);
		std::cout<<"OK type len="<<text.size()<<"\n";
		return true;
	}
		if(cmd=="key" && parts.size()>=2){
		POINT pt; if(GetCursorPos(&pt)){ mouse_click("left"); }
		send_combo(parts[1]);
		std::cout<<"OK key "<<parts[1]<<"\n";
		return true;
	}
		if(cmd=="keydown" && parts.size()>=2){
			WORD vk = vk_from_name(parts[1]);
			if(vk){
				// Đảm bảo focus: đưa cửa sổ dưới vị trí con trỏ cuối cùng lên foreground
				std::string raw = parts[1]; std::string low=raw; for(char &c:low)c=(char)tolower(c);
				if(low!="ctrl" && low!="alt" && low!="shift"){
					focus_window_under_last_pointer();
				}
				send_vk_down(vk);
				std::cout<<"OK keydown "<<parts[1]<<"\n";
			} else { std::cout<<"ERR keydown\n"; }
			return true;
		}
		if(cmd=="keyup" && parts.size()>=2){
			WORD vk = vk_from_name(parts[1]);
			if(vk){ send_vk_up(vk); std::cout<<"OK keyup "<<parts[1]<<"\n"; } else { std::cout<<"ERR keyup\n"; }
			return true;
		}
	if(cmd=="capture"){ if(parts.size()>=2){ std::string onoff=parts[1]; for(char &c:onoff)c=(char)tolower(c); if(onoff=="on"){ if(parts.size()>=3) g_capture_interval_ms = std::max(100, std::stoi(parts[2])); if(!g_capture){ g_capture=true; g_capture_thread=std::thread(capture_loop);} std::cout<<"OK\n"; return true; } else if(onoff=="off"){ if(g_capture){ g_capture=false; if(g_capture_thread.joinable()) g_capture_thread.join(); } std::cout<<"OK\n"; return true; } } std::cout<<"ERR usage CAPTURE ON [interval_ms]|OFF\n"; return true; }
	// Clipboard set: CLIPSET <base64>
	if(cmd=="clipset" && parts.size()>=2){ std::string b64 = parts[1]; auto bytes = base64_decode(b64); std::string utf8(bytes.begin(), bytes.end()); bool ok = set_clipboard_text_utf8(utf8); std::cout<<(ok?"OK clipset\n":"ERR clipset\n"); return true; }
	// Clipboard get: CLIPGET -> outputs CLIP <base64>
	if(cmd=="clipget"){ std::string utf8 = get_clipboard_text_utf8(); std::string b64 = base64_encode((const unsigned char*)utf8.data(), utf8.size()); std::cout<<"CLIP "<<b64<<"\n"; return true; }
	if(cmd=="quit") return false;
	std::cout<<"ERR unknown\n"; return true; }

static int run_server(uint16_t port){ if(!Tcp::init()){ std::fprintf(stderr,"WSA init failed\n"); return 1; } Tcp srv,cli; if(!tcp_listen(port,srv)){ std::fprintf(stderr,"bind/listen failed (port %u, err=%lu)\n", port, GetLastError()); Tcp::done(); return 2; } std::printf("[server] listening on %u\n", port); if(!tcp_accept(srv,cli)){ std::fprintf(stderr,"accept failed (err=%lu)\n", GetLastError()); srv.close(); Tcp::done(); return 3; } g_client_sock = cli.s; std::printf("[server] client connected\n"); std::string acc; acc.reserve(4096); char buf[1024]; bool authed=false; while(true){ int n=tcp_recv(cli,buf,sizeof(buf)); if(n<=0) break; for(int i=0;i<n;++i){ char ch=buf[i]; if(ch=='\n'){ bool cont=handle_command(acc,authed); acc.clear(); if(!cont){ cli.close(); srv.close(); Tcp::done(); return 0; } } else if(ch!='\r'){ acc.push_back(ch);} } } if(g_capture){ g_capture=false; if(g_capture_thread.joinable()) g_capture_thread.join(); } g_client_sock=INVALID_SOCKET; cli.close(); srv.close(); Tcp::done(); return 0; }
static int run_client(const std::string &host,uint16_t port,bool demo){ if(!Tcp::init()){ std::fprintf(stderr,"WSA init failed\n"); return 1; } Tcp cli; if(!tcp_connect(host,port,cli)){ std::fprintf(stderr,"connect failed %s:%u (err=%lu)\n", host.c_str(), port, GetLastError()); Tcp::done(); return 2; } auto sendline=[&](const std::string &l){ std::string ln=l; if(ln.empty()||ln.back()!='\n') ln+="\n"; tcp_send(cli, ln); }; sendline("AUTH "+TOKEN); if(demo){ sendline("MOVE 600 400"); sleep_ms(150); sendline("CLICK left"); sleep_ms(150); sendline("TYPE Hello from RemoteBT demo!"); sleep_ms(150); sendline("KEY Enter"); sendline("QUIT"); } else { std::cout<<"Connected. Commands: MOVE x y | CLICK left | TYPE text | KEY ctrl+v | SCROLL 120 | QUIT\n"; std::string line; while(std::getline(std::cin,line)){ if(line.empty()) continue; sendline(line); if(line=="QUIT"||line=="quit") break; } } cli.close(); Tcp::done(); return 0; }

int main(int argc,char **argv){
	// init GDI+
	ULONG_PTR gdipToken=0; Gdiplus::GdiplusStartupInput gsi; Gdiplus::GdiplusStartup(&gdipToken, &gsi, nullptr);
	// Enable DPI awareness so GetSystemMetrics returns physical pixels
	HMODULE user32 = GetModuleHandleA("user32.dll");
	if(user32){
		// Try modern per-monitor v2 first
		auto setCtx = (BOOL (WINAPI*)(DPI_AWARENESS_CONTEXT)) GetProcAddress(user32, "SetProcessDpiAwarenessContext");
		if(setCtx){ setCtx((DPI_AWARENESS_CONTEXT)-4); /* PER_MONITOR_AWARE_V2 */ }
		else {
			auto setDpiAware = (BOOL (WINAPI*)()) GetProcAddress(user32, "SetProcessDPIAware");
			if(setDpiAware) setDpiAware();
		}
	}
	bool isServer=false,isClient=false,isAgent=false,demo=false; std::string host="127.0.0.1"; uint16_t port=5555; for(int i=1;i<argc;++i){ std::string a=argv[i]; if(a=="--server") isServer=true; else if(a=="--client") isClient=true; else if(a=="--agent") isAgent=true; else if(a=="--demo") demo=true; else if(a=="--host" && i+1<argc) host=argv[++i]; else if(a=="--port" && i+1<argc) port=(uint16_t)std::stoi(argv[++i]); else if(a=="--token" && i+1<argc) TOKEN=argv[++i]; else if(a=="-h"||a=="--help"){ std::puts("Usage:\n  remotebt_helper --server [--port 5555] [--token dev-secret]\n  remotebt_helper --client --host <ip> [--port 5555] [--token dev-secret] [--demo]\n  remotebt_helper --agent --host <ip> [--port 5555] [--token dev-secret]\n\nModes:\n  --server : listen for commands on TCP (legacy local testing)\n  --client : send commands interactively to a remote server (dev tool)\n  --agent  : connect OUTBOUND to signaling and receive control commands (recommended)"); Gdiplus::GdiplusShutdown(gdipToken); return 0; } }
	int selected = (isServer?1:0)+(isClient?1:0)+(isAgent?1:0);
	if(selected!=1){ std::puts("Pick exactly one mode: --server OR --client OR --agent\nUse -h for help."); Gdiplus::GdiplusShutdown(gdipToken); return 0; }

	// forward declare run_agent with reconnect
	auto run_agent = [&](const std::string &h,uint16_t p)->int{
		if(!Tcp::init()){ std::fprintf(stderr,"WSA init failed\n"); return 1; }
		int attempt=0; bool stop=false; while(!stop){
			Tcp cli; if(!tcp_connect(h,p,cli)){
				long err = GetLastError();
				int delay = std::min(30000, (1<<std::min(attempt,10)) * 250); // 250ms, 500ms, 1s, 2s... up to ~30s
				std::fprintf(stderr,"[agent] connect failed %s:%u (err=%ld), retry in %d ms\n", h.c_str(), p, err, delay);
				sleep_ms(delay); attempt++; continue;
			}
			attempt=0; g_client_sock = cli.s;
			// authenticate TO server (signaling)
			{
				std::string line = std::string("AUTH ")+TOKEN+"\n";
				tcp_send(cli, line);
			}
			// Send initial geometry metadata so controller can map coordinates precisely
			{
				g_vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
				g_vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
				g_vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
				g_vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
				char bufGeom[128];
				std::snprintf(bufGeom, sizeof(bufGeom), "GEOM %d %d %d %d\n", g_vx, g_vy, g_vw, g_vh);
				tcp_send(cli, bufGeom);
			}
			std::string acc; acc.reserve(4096); char buf[1024]; bool authed=true;
			while(true){ int n=tcp_recv(cli,buf,sizeof(buf)); if(n<=0) break; for(int i=0;i<n;++i){ char ch=buf[i]; if(ch=='\n'){ bool cont=handle_command(acc,authed); acc.clear(); if(!cont){ stop=true; break; } } else if(ch!='\r'){ acc.push_back(ch);} } if(stop) break; }
			// connection closed: ensure capture thread stopped
			if(g_capture){ g_capture=false; if(g_capture_thread.joinable()) g_capture_thread.join(); }
			g_client_sock=INVALID_SOCKET; cli.close(); if(stop) break; // else reconnect
		}
		Tcp::done(); return 0; };

	int rc = isServer? run_server(port) : (isClient? run_client(host,port,demo) : run_agent(host,port));
	Gdiplus::GdiplusShutdown(gdipToken);
	return rc;
}

