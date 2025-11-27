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
//bao mat
#define SECURITY_WIN32
#include <security.h>
#include <schannel.h>
#include <sspi.h>

#pragma comment(lib, "Secur32.lib")
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
static void mouse_move_virtual(int x,int y){ 
	SetCursorPos(x + g_vx, y + g_vy); 
}
static void mouse_btn(const std::string &btn,bool down){ std::string b=btn; for(char &c:b)c=(char)tolower(c); DWORD f=0; if(b=="left") f=down?MOUSEEVENTF_LEFTDOWN:MOUSEEVENTF_LEFTUP; else if(b=="right") f=down?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_RIGHTUP; else if(b=="middle") f=down?MOUSEEVENTF_MIDDLEDOWN:MOUSEEVENTF_MIDDLEUP; if(!f) return; INPUT in{}; in.type=INPUT_MOUSE; in.mi.dwFlags=f; SendInput(1,&in,sizeof(INPUT)); }
static void mouse_click(const std::string &btn){ 
	mouse_btn(btn,true); 
	sleep_ms(10); 
	mouse_btn(btn,false); 
}
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
	std::string tmp; 
	for(char c:combo) tmp.push_back(c=='+'?' ':c);
	auto parts=split_ws(tmp);
	std::vector<WORD> down;
	for(auto &p:parts){
		std::string n=p; 
		for(char &c:n)c=(char)tolower(c);
		WORD vk=0; 
		if(n=="ctrl") vk=VK_CONTROL; 
		else if(n=="alt") vk=VK_MENU; 
		else if(n=="shift") vk=VK_SHIFT; 
		else vk=vk_from_name(p);
		if(vk){ 
			send_vk_down(vk); 
			down.push_back(vk);
		} 
	}
	for(size_t i=0;i<down.size();++i){ 
		WORD vk = down[down.size()-1-i]; 
		send_vk_up(vk); 
	}
}

// ---------------- Networking ----------------
struct Tcp { SOCKET s=INVALID_SOCKET; static bool init(){ WSADATA w; return WSAStartup(MAKEWORD(2,2),&w)==0; } static void done(){ WSACleanup(); } void close(){ if(s!=INVALID_SOCKET){ closesocket(s); s=INVALID_SOCKET; } } };
static bool tcp_listen(uint16_t port, Tcp &srv){ 
	srv.s=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);
	if(srv.s==INVALID_SOCKET) return false; 
	sockaddr_in a{}; 
	a.sin_family=AF_INET; 
	a.sin_addr.s_addr=htonl(INADDR_ANY); 
	a.sin_port=htons(port);
	int yes=1;
	setsockopt(srv.s,SOL_SOCKET,SO_REUSEADDR,(const char*)&yes,sizeof(yes));
	if(bind(srv.s,(sockaddr*)&a,sizeof(a))!=0) return false; 
	if(listen(srv.s,1)!=0) return false; 
	return true;
	}
static bool tcp_accept(Tcp &srv, Tcp &cli){ cli.s=accept(srv.s,nullptr,nullptr); return cli.s!=INVALID_SOCKET; }
static bool tcp_connect(const std::string &host,uint16_t port, Tcp &cli){ cli.s=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP); if(cli.s==INVALID_SOCKET) return false; sockaddr_in a{}; a.sin_family=AF_INET; inet_pton(AF_INET,host.c_str(),&a.sin_addr); a.sin_port=htons(port); return connect(cli.s,(sockaddr*)&a,sizeof(a))==0; }
static int tcp_send(Tcp &c,const std::string &d){ return send(c.s,d.c_str(),(int)d.size(),0); }
static int tcp_recv(Tcp &c,char *buf,int cap){ return recv(c.s,buf,cap,0); }

// ---------------- Protocol ----------------
static std::string TOKEN="dev-secret";
// capture globals
static std::atomic<bool> g_capture{false};
static int g_capture_interval_ms = 1000;
static int g_jpeg_quality = 75; // JPEG quality 1-100 (75=good balance, 50=smaller, 90=higher quality)
static std::thread g_capture_thread;
static std::mutex g_send_mx;
static SOCKET g_client_sock = INVALID_SOCKET;

//baomat tcp tls
// Lớp bao đóng (Wrapper) cho Windows SChannel (TLS 1.2/1.3)
// Giúp mã hóa/giải mã dữ liệu mà không cần OpenSSL
class SimpleTls {
    CredHandle hCred;
    CtxtHandle hCtxt;
    bool haveCred = false;
    bool haveCtxt = false;
    bool secureReady = false;
    SOCKET sock = INVALID_SOCKET;
    std::vector<char> incomingBuf;  // Bộ đệm nhận dữ liệu thô từ mạng
    std::vector<char> decryptedBuf; // Bộ đệm dữ liệu đã giải mã

public:
    SimpleTls() {
        incomingBuf.reserve(16384);
        decryptedBuf.reserve(16384);
    }

    ~SimpleTls() { Cleanup(); }

    void Cleanup() {
        if (haveCtxt) { DeleteSecurityContext(&hCtxt); haveCtxt = false; }
        if (haveCred) { FreeCredentialsHandle(&hCred); haveCred = false; }
        // Lưu ý: Class này không đóng socket, việc đó do Tcp struct quản lý
        secureReady = false;
        sock = INVALID_SOCKET;
    }

    // Thực hiện bắt tay (Handshake) với Server
    bool Handshake(SOCKET s, const std::string& host) {
        sock = s;
        SCHANNEL_CRED credData = { 0 };
        credData.dwVersion = SCHANNEL_CRED_VERSION;
        // QUAN TRỌNG: Cờ này giúp bỏ qua lỗi chứng chỉ tự ký (Self-signed)
        credData.dwFlags = SCH_CRED_NO_DEFAULT_CREDS | SCH_CRED_MANUAL_CRED_VALIDATION | SCH_CRED_IGNORE_NO_REVOCATION_CHECK | SCH_CRED_IGNORE_REVOCATION_OFFLINE;
        credData.grbitEnabledProtocols = SP_PROT_TLS1_2_CLIENT | SP_PROT_TLS1_3_CLIENT;

        TimeStamp ts;
        if (AcquireCredentialsHandleA(NULL, (LPSTR)UNISP_NAME_A, SECPKG_CRED_OUTBOUND, NULL, &credData, NULL, NULL, &hCred, &ts) != SEC_E_OK) {
            std::fprintf(stderr, "[TLS] AcquireCredentialsHandle failed\n");
            return false;
        }
        haveCred = true;

        DWORD sspiFlags = ISC_REQ_SEQUENCE_DETECT | ISC_REQ_REPLAY_DETECT | ISC_REQ_CONFIDENTIALITY | ISC_REQ_STREAM | ISC_REQ_MANUAL_CRED_VALIDATION;
        SecBufferDesc outDesc, inDesc;
        SecBuffer outSec[1], inSec[2];
        unsigned long ctxAttr;

        bool loop = true;
        while (loop) {
            outSec[0] = { 0, SECBUFFER_TOKEN, NULL };
            outDesc = { SECBUFFER_VERSION, 1, outSec };
            
            inSec[0] = { (unsigned long)incomingBuf.size(), SECBUFFER_TOKEN, incomingBuf.data() };
            inSec[1] = { 0, SECBUFFER_EMPTY, NULL };
            inDesc = { SECBUFFER_VERSION, 2, inSec };

            SECURITY_STATUS scRet = InitializeSecurityContextA(&hCred, haveCtxt ? &hCtxt : NULL, (SEC_CHAR*)host.c_str(), sspiFlags, 0, 0, incomingBuf.empty() ? NULL : &inDesc, 0, &hCtxt, &outDesc, &ctxAttr, &ts);
            haveCtxt = true;

            if (inSec[1].BufferType == SECBUFFER_EXTRA) {
                // Di chuyển phần dữ liệu thừa lên đầu buffer
                size_t consumed = incomingBuf.size() - inSec[1].cbBuffer;
                memmove(incomingBuf.data(), incomingBuf.data() + consumed, inSec[1].cbBuffer);
                incomingBuf.resize(inSec[1].cbBuffer);
            }
            else if (scRet != SEC_E_INCOMPLETE_MESSAGE) {
                incomingBuf.clear();
            }

            if (scRet == SEC_E_OK || scRet == SEC_I_CONTINUE_NEEDED) {
                if (outSec[0].cbBuffer > 0 && outSec[0].pvBuffer) {
                    send(sock, (char*)outSec[0].pvBuffer, outSec[0].cbBuffer, 0);
                    FreeContextBuffer(outSec[0].pvBuffer);
                }
                if (scRet == SEC_E_OK) {
                    secureReady = true;
                    loop = false;
                }
                else {
                    // Cần thêm dữ liệu từ server để tiếp tục handshake
                    char tBuf[4096];
                    int n = recv(sock, tBuf, sizeof(tBuf), 0);
                    if (n <= 0) return false;
                    incomingBuf.insert(incomingBuf.end(), tBuf, tBuf + n);
                }
            }
            else if (scRet == SEC_E_INCOMPLETE_MESSAGE) {
                char tBuf[4096];
                int n = recv(sock, tBuf, sizeof(tBuf), 0);
                if (n <= 0) return false;
                incomingBuf.insert(incomingBuf.end(), tBuf, tBuf + n);
            }
            else {
                std::fprintf(stderr, "[TLS] Handshake failed: 0x%x\n", scRet);
                return false;
            }
        }
        return true;
    }

    // Gửi dữ liệu (Mã hóa trước khi gửi)
    int Send(const char* data, int len) {
        if (!secureReady) return send(sock, data, len, 0);

        SecPkgContext_StreamSizes sizes;
        QueryContextAttributes(&hCtxt, SECPKG_ATTR_STREAM_SIZES, &sizes);

        std::vector<char> msg(sizes.cbHeader + len + sizes.cbTrailer);
        SecBuffer buffers[4];
        buffers[0] = { sizes.cbHeader, SECBUFFER_STREAM_HEADER, msg.data() };
        buffers[1] = { (unsigned long)len, SECBUFFER_DATA, msg.data() + sizes.cbHeader };
        memcpy(buffers[1].pvBuffer, data, len);
        buffers[2] = { sizes.cbTrailer, SECBUFFER_STREAM_TRAILER, msg.data() + sizes.cbHeader + len };
        buffers[3] = { 0, SECBUFFER_EMPTY, NULL };
        SecBufferDesc desc = { SECBUFFER_VERSION, 4, buffers };

        if (EncryptMessage(&hCtxt, 0, &desc, 0) != SEC_E_OK) return -1;
        
        int total = buffers[0].cbBuffer + buffers[1].cbBuffer + buffers[2].cbBuffer;
        return send(sock, msg.data(), total, 0);
    }
    
    // Nhận dữ liệu (Nhận và Giải mã)
    int Recv(char* buf, int maxLen) {
        if (!secureReady) return recv(sock, buf, maxLen, 0);

        // Nếu còn dữ liệu đã giải mã trong buffer, trả về ngay
        if (!decryptedBuf.empty()) {
            int toCopy = std::min(maxLen, (int)decryptedBuf.size());
            memcpy(buf, decryptedBuf.data(), toCopy);
            if (toCopy < decryptedBuf.size()) {
                memmove(decryptedBuf.data(), decryptedBuf.data() + toCopy, decryptedBuf.size() - toCopy);
                decryptedBuf.resize(decryptedBuf.size() - toCopy);
            } else {
                decryptedBuf.clear();
            }
            return toCopy;
        }

        // Đọc từ mạng và giải mã
        while (true) {
            if (incomingBuf.empty()) {
                char tBuf[4096];
                int n = recv(sock, tBuf, sizeof(tBuf), 0);
                if (n <= 0) return n;
                incomingBuf.insert(incomingBuf.end(), tBuf, tBuf + n);
            }

            SecBuffer buffers[4];
            buffers[0] = { (unsigned long)incomingBuf.size(), SECBUFFER_DATA, incomingBuf.data() };
            buffers[1] = { 0, SECBUFFER_EMPTY, NULL };
            buffers[2] = { 0, SECBUFFER_EMPTY, NULL };
            buffers[3] = { 0, SECBUFFER_EMPTY, NULL };
            SecBufferDesc desc = { SECBUFFER_VERSION, 4, buffers };

            SECURITY_STATUS scRet = DecryptMessage(&hCtxt, &desc, 0, NULL);

            if (scRet == SEC_E_OK || scRet == SEC_I_RENEGOTIATE) {
                // Tìm buffer chứa dữ liệu thật (DATA)
                for (int i = 1; i < 4; i++) {
                    if (buffers[i].BufferType == SECBUFFER_DATA) {
                        decryptedBuf.insert(decryptedBuf.end(), (char*)buffers[i].pvBuffer, (char*)buffers[i].pvBuffer + buffers[i].cbBuffer);
                    }
                }
                // Xử lý dữ liệu thừa (EXTRA) cho lần sau
                for (int i = 1; i < 4; i++) {
                    if (buffers[i].BufferType == SECBUFFER_EXTRA) {
                        size_t consumed = incomingBuf.size() - buffers[i].cbBuffer;
                        memmove(incomingBuf.data(), incomingBuf.data() + consumed, buffers[i].cbBuffer);
                        incomingBuf.resize(buffers[i].cbBuffer);
                        goto CheckData;
                    }
                }
                incomingBuf.clear();

            CheckData:
                if (!decryptedBuf.empty()) {
                    int toCopy = std::min(maxLen, (int)decryptedBuf.size());
                    memcpy(buf, decryptedBuf.data(), toCopy);
                    if (toCopy < decryptedBuf.size()) {
                        memmove(decryptedBuf.data(), decryptedBuf.data() + toCopy, decryptedBuf.size() - toCopy);
                        decryptedBuf.resize(decryptedBuf.size() - toCopy);
                    } else {
                        decryptedBuf.clear();
                    }
                    return toCopy;
                }
            }
            else if (scRet == SEC_E_INCOMPLETE_MESSAGE) {
                // Cần nhận thêm dữ liệu
                char tBuf[4096];
                int n = recv(sock, tBuf, sizeof(tBuf), 0);
                if (n <= 0) return n;
                incomingBuf.insert(incomingBuf.end(), tBuf, tBuf + n);
            }
            else {
                return -1; // Lỗi
            }
        }
    }
};

// Biến toàn cục để hàm gửi ảnh (send_frame_over_tcp) có thể truy cập TLS
static SimpleTls* g_active_tls = nullptr;
//ketthuc phan bao mat

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

// capture screen to JPEG (GDI+) - no resolution scaling to avoid coordinate mismatch
static bool get_jpeg_bytes(std::vector<unsigned char>& out, int &outW, int &outH, ULONG quality = 75){
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
	
	// Create GDI+ bitmap from capture (keep full resolution, no downscaling)
	Gdiplus::Bitmap bmpFull(hBmp, nullptr);
	
	// Keep full resolution for accurate mouse coordinates
	outW = w;
	outH = h;
	Gdiplus::Bitmap* bmp = &bmpFull;
	
	CLSID clsidJpeg; UINT num=0, size=0; Gdiplus::GetImageEncodersSize(&num,&size);
	std::vector<BYTE> enc(size); Gdiplus::ImageCodecInfo* pInfo = reinterpret_cast<Gdiplus::ImageCodecInfo*>(enc.data());
	Gdiplus::GetImageEncoders(num, size, pInfo);
	for(UINT i=0;i<num;++i){ if(wcscmp(pInfo[i].MimeType, L"image/jpeg")==0){ clsidJpeg = pInfo[i].Clsid; break; } }
	// Set JPEG quality (1-100, lower = smaller file size)
	Gdiplus::EncoderParameters encoderParams;
	encoderParams.Count = 1;
	encoderParams.Parameter[0].Guid = Gdiplus::EncoderQuality;
	encoderParams.Parameter[0].Type = Gdiplus::EncoderParameterValueTypeLong;
	encoderParams.Parameter[0].NumberOfValues = 1;
	encoderParams.Parameter[0].Value = &quality;
	IStream* stream=nullptr; CreateStreamOnHGlobal(nullptr, TRUE, &stream);
	bmp->Save(stream, &clsidJpeg, &encoderParams);
	// extract bytes
	HGLOBAL hg; GetHGlobalFromStream(stream, &hg); SIZE_T sz = GlobalSize(hg); void* p = GlobalLock(hg);
	out.assign((unsigned char*)p, (unsigned char*)p + sz);
	GlobalUnlock(hg); stream->Release();
	DeleteObject(hBmp); DeleteDC(hMem); ReleaseDC(nullptr,hScreen);
	return !out.empty();
}

// --- Thay thế hàm send_frame_over_tcp cũ bằng ưu tiên dùng tcp ---

static void send_frame_over_tcp(const std::string &b64, int w, int h){
    // Nếu không có kết nối nào thì thoát
    if(g_client_sock==INVALID_SOCKET) return;

    std::lock_guard<std::mutex> lk(g_send_mx);
    std::string header = "FRAME "+std::to_string(b64.size())+" "+std::to_string(w)+"x"+std::to_string(h)+"\n";
    
    // [ĐIỂM KHÁC BIỆT]: Kiểm tra xem có đang dùng TLS không?
    if (g_active_tls) {
        // Có TLS -> Gửi mã hóa
        g_active_tls->Send(header.c_str(), (int)header.size());
        g_active_tls->Send(b64.c_str(), (int)b64.size());
        const char nl='\n'; 
        g_active_tls->Send(&nl, 1);
    } else {
        // Không TLS -> Gửi thường (như code cũ)
        send(g_client_sock, header.c_str(), (int)header.size(), 0);
        send(g_client_sock, b64.c_str(), (int)b64.size(), 0);
        const char nl='\n'; 
        send(g_client_sock, &nl, 1, 0);
    }
}

static void capture_loop(){
	while(g_capture){
		int w=0, h=0;
		std::vector<unsigned char> jpeg; 
		if(get_jpeg_bytes(jpeg, w, h, g_jpeg_quality)){
			std::string b64 = base64_encode(jpeg.data(), jpeg.size());
			send_frame_over_tcp(b64, w, h);
		}
		sleep_ms(g_capture_interval_ms);
	}
}

static bool handle_command(const std::string &line, bool &authed){ 
	auto parts=split_ws(line); 
	if(parts.empty()) return true; 
	std::string cmd=parts[0]; 
	for(char &c:cmd)c=(char)tolower(c);
	if(cmd=="auth"){ 
		// In agent mode (authed=true), ignore AUTH from server (server sends AUTH as compat check)
		if(authed) return true;
		// In server mode (authed=false), verify AUTH from client
		if(parts.size()>=2 && parts[1]==TOKEN){ authed=true; std::cout<<"OK auth\n"; } else std::cout<<"ERR auth\n"; 
		return true; 
	}
	if(!authed){ std::cout<<"ERR need AUTH first\n"; return true; }
	if(cmd=="move" && parts.size()>=3)
	{
		// Throttle MOVE to max 60fps (16ms) to reduce CPU overhead
		static DWORD lastMoveTime = 0;
		DWORD now = GetTickCount();
		if(now - lastMoveTime < 16) {
			return true; // Skip this MOVE
		}
		lastMoveTime = now;
		int x = std::stoi(parts[1]); int y = std::stoi(parts[2]);
		g_lastX.store(x); g_lastY.store(y);
		mouse_move_virtual(x, y);
		// Removed OK log to reduce I/O spam (30-60 calls/sec)
		return true; 
	}
	if(cmd=="click" && parts.size()>=2){ 
		mouse_click(parts[1]); 
		return true; 
	}
	if(cmd=="down" && parts.size()>=2){ mouse_btn(parts[1],true); return true; }
	if(cmd=="up" && parts.size()>=2){ mouse_btn(parts[1],false); return true; }
	if(cmd=="scroll" && parts.size()>=2){ mouse_scroll(std::stoi(parts[1])); return true; }
	if(cmd=="type" && parts.size()>=2){
		// Ensure target window focused by synthetic click at current cursor location
		POINT pt; 
		if(GetCursorPos(&pt)){ mouse_click("left"); }
		auto text=line.substr(line.find(' ')+1);
		type_text(text);
		// Removed verbose log
		return true;
	}
	if(cmd=="key" && parts.size()>=2){
	POINT pt; if(GetCursorPos(&pt)){ mouse_click("left"); }
	send_combo(parts[1]);
	// Removed verbose log
	return true;
	}
	if(cmd=="keydown" && parts.size()>=2){
		WORD vk = vk_from_name(parts[1]);
		if(vk){
			// Đảm bảo focus: đưa cửa sổ dưới vị trí con trỏ cuối cùng lên foreground
			std::string raw = parts[1]; 
			std::string low=raw; 
			for(char &c:low)c=(char)tolower(c);
			if(low!="ctrl" && low!="alt" && low!="shift"){
				focus_window_under_last_pointer();
			}
			send_vk_down(vk);
			// Removed verbose log
		} else { std::cout<<"ERR keydown\n"; }
		return true;
	}
	if(cmd=="keyup" && parts.size()>=2){
		WORD vk = vk_from_name(parts[1]);
		if(vk){ send_vk_up(vk); /* Removed verbose log */ } else { std::cout<<"ERR keyup\n"; }
		return true;
	}
	if(cmd=="capture"){ 
		if(parts.size()>=2){ 
			std::string onoff=parts[1]; 
			for(char &c:onoff)c=(char)tolower(c); 
			if(onoff=="on"){ 
				if(parts.size()>=3) g_capture_interval_ms = std::max(100, std::stoi(parts[2])); 
				if(!g_capture){ 
					g_capture=true; 
					g_capture_thread=std::thread(capture_loop);
				} 
				return true; 
			} else if(onoff=="off"){ 
				if(g_capture){ 
					g_capture=false; 
					if(g_capture_thread.joinable()) g_capture_thread.join(); 
				} 
				return true; 
			} 
		} 
		std::cout<<"ERR usage CAPTURE ON [interval_ms]|OFF\n"; 
		return true; 
	}
	// Quality command: QUALITY 50-90 (JPEG quality, lower=smaller file, higher=better quality)
	if(cmd=="quality" && parts.size()>=2){ int q = std::stoi(parts[1]); g_jpeg_quality = std::max(1, std::min(100, q)); /* Removed verbose log */ return true; }
	// Clipboard set: CLIPSET <base64>
	if(cmd=="clipset" && parts.size()>=2){ std::string b64 = parts[1]; auto bytes = base64_decode(b64); std::string utf8(bytes.begin(), bytes.end()); bool ok = set_clipboard_text_utf8(utf8); std::cout<<(ok?"OK clipset\n":"ERR clipset\n"); return true; }
	// Clipboard get: CLIPGET -> outputs CLIP <base64>
	if(cmd=="clipget"){ std::string utf8 = get_clipboard_text_utf8(); std::string b64 = base64_encode((const unsigned char*)utf8.data(), utf8.size()); std::cout<<"CLIP "<<b64<<"\n"; return true; }
	if(cmd=="quit") return false;
	std::cout<<"ERR unknown\n"; return true; }

static int run_server(uint16_t port){ if(!Tcp::init()){ std::fprintf(stderr,"WSA init failed\n"); return 1; } Tcp srv,cli; if(!tcp_listen(port,srv)){ std::fprintf(stderr,"bind/listen failed (port %u, err=%lu)\n", port, GetLastError()); Tcp::done(); return 2; } std::printf("[server] listening on %u\n", port); if(!tcp_accept(srv,cli)){ std::fprintf(stderr,"accept failed (err=%lu)\n", GetLastError()); srv.close(); Tcp::done(); return 3; } g_client_sock = cli.s; std::printf("[server] client connected\n"); std::string acc; acc.reserve(4096); char buf[1024]; bool authed=false; while(true){ int n=tcp_recv(cli,buf,sizeof(buf)); if(n<=0) break; for(int i=0;i<n;++i){ char ch=buf[i]; if(ch=='\n'){ bool cont=handle_command(acc,authed); acc.clear(); if(!cont){ cli.close(); srv.close(); Tcp::done(); return 0; } } else if(ch!='\r'){ acc.push_back(ch);} } } if(g_capture){ g_capture=false; if(g_capture_thread.joinable()) g_capture_thread.join(); } g_client_sock=INVALID_SOCKET; cli.close(); srv.close(); Tcp::done(); return 0; }
static int run_client(const std::string &host,uint16_t port,bool demo){ if(!Tcp::init()){ std::fprintf(stderr,"WSA init failed\n"); return 1; } Tcp cli; if(!tcp_connect(host,port,cli)){ std::fprintf(stderr,"connect failed %s:%u (err=%lu)\n", host.c_str(), port, GetLastError()); Tcp::done(); return 2; } auto sendline=[&](const std::string &l){ std::string ln=l; if(ln.empty()||ln.back()!='\n') ln+="\n"; tcp_send(cli, ln); }; sendline("AUTH "+TOKEN); if(demo){ sendline("MOVE 600 400"); sleep_ms(150); sendline("CLICK left"); sleep_ms(150); sendline("TYPE Hello from RemoteBT demo!"); sleep_ms(150); sendline("KEY Enter"); sendline("QUIT"); } else { std::cout<<"Connected. Commands: MOVE x y | CLICK left | TYPE text | KEY ctrl+v | SCROLL 120 | QUIT\n"; std::string line; while(std::getline(std::cin,line)){ if(line.empty()) continue; sendline(line); if(line=="QUIT"||line=="quit") break; } } cli.close(); Tcp::done(); return 0; }

// Simple HTTP response helper
static void send_http_response(SOCKET s, int status_code, const std::string &status_text, const std::string &body) {
	std::string headers = "HTTP/1.1 " + std::to_string(status_code) + " " + status_text + "\r\n";
	headers += "Content-Type: application/json\r\n";
	headers += "Content-Length: " + std::to_string(body.size()) + "\r\n";
	headers += "Access-Control-Allow-Origin: *\r\n";
	headers += "Connection: close\r\n\r\n";
	std::string response = headers + body;
	send(s, response.c_str(), (int)response.size(), 0);
}

// Read config.json and extract server_host, port, and token
static bool read_config(std::string &server_host, uint16_t &port, std::string &token) {
	FILE *f = fopen("config.json", "r");
	if(!f) return false;
	
	fseek(f, 0, SEEK_END);
	long sz = ftell(f);
	fseek(f, 0, SEEK_SET);
	
	std::string content(sz, '\0');
	fread(&content[0], 1, sz, f);
	fclose(f);
	
	// Simple JSON parsing: find "server_host":"value" and "token":"value"
	size_t hostPos = content.find("\"server_host\"");
	if(hostPos != std::string::npos) {
		size_t colonPos = content.find(":", hostPos);
		size_t quoteStart = content.find("\"", colonPos);
		size_t quoteEnd = content.find("\"", quoteStart + 1);
		if(quoteStart != std::string::npos && quoteEnd != std::string::npos) {
			server_host = content.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
		}
	}
	
	size_t tokenPos = content.find("\"token\"");
	if(tokenPos != std::string::npos) {
		size_t colonPos = content.find(":", tokenPos);
		size_t quoteStart = content.find("\"", colonPos);
		size_t quoteEnd = content.find("\"", quoteStart + 1);
		if(quoteStart != std::string::npos && quoteEnd != std::string::npos) {
			token = content.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
		}
	}
	
	size_t portPos = content.find("\"port\"");
	if(portPos != std::string::npos) {
		size_t colonPos = content.find(":", portPos);
		size_t numStart = colonPos + 1;
		while(numStart < content.size() && (content[numStart] == ' ' || content[numStart] == '\t')) numStart++;
		size_t numEnd = numStart;
		while(numEnd < content.size() && content[numEnd] >= '0' && content[numEnd] <= '9') numEnd++;
		if(numEnd > numStart) {
			port = (uint16_t)std::stoi(content.substr(numStart, numEnd - numStart));
		}
	}
	
	return !server_host.empty() && !token.empty() && port > 0;
}

// Mini HTTP server for config mode
static int run_config_server(uint16_t port) {
	if(!Tcp::init()){ 
		std::fprintf(stderr,"WSA init failed\n"); 
		return 1; 
	}
	Tcp srv;
	if(!tcp_listen(port, srv)){
		std::fprintf(stderr,"[config] bind/listen failed on port %u (err=%lu)\n", port, GetLastError());
		Tcp::done();
		return 2;
	}
	std::printf("[config] HTTP server listening on localhost:%u\n", port);
	std::printf("[config] Waiting for configuration from web dashboard...\n");
	
	while(true) {
		Tcp cli;
		if(!tcp_accept(srv, cli)) continue;
		
		// Read HTTP request
		std::string req;
		char buf[4096];
		int n = tcp_recv(cli, buf, sizeof(buf)-1);
		if(n <= 0) { 
			cli.close(); 
			continue; 
		}
		buf[n] = '\0';
		req = buf;
		
		// Parse first line: POST /config HTTP/1.1
		size_t firstLine = req.find("\r\n");
		if(firstLine == std::string::npos) { cli.close(); continue; }
		std::string method = req.substr(0, req.find(' '));
		
		// Handle OPTIONS (CORS preflight)
		if(method == "OPTIONS") {
			std::string resp = "HTTP/1.1 204 No Content\r\n";
			resp += "Access-Control-Allow-Origin: *\r\n";
			resp += "Access-Control-Allow-Methods: POST, OPTIONS\r\n";
			resp += "Access-Control-Allow-Headers: Content-Type\r\n";
			resp += "Connection: close\r\n\r\n";
			send(cli.s, resp.c_str(), (int)resp.size(), 0);
			cli.close();
			continue;
		}
		
		// Handle POST /config
		if(method != "POST") {
			send_http_response(cli.s, 405, "Method Not Allowed", "{\"error\":\"Only POST allowed\"}");
			cli.close();
			continue;
		}
		
		// Extract JSON body (after \r\n\r\n)
		size_t bodyStart = req.find("\r\n\r\n");
		if(bodyStart == std::string::npos) {
			send_http_response(cli.s, 400, "Bad Request", "{\"error\":\"No body found\"}");
			cli.close();
			continue;
		}
		std::string body = req.substr(bodyStart + 4);
		
		// Simple JSON parsing: find "server_host":"value", "port":number, and "token":"value"
		std::string server_host, token;
		uint16_t port = 5555;
		size_t hostPos = body.find("\"server_host\"");
		if(hostPos != std::string::npos) {
			size_t colonPos = body.find(":", hostPos);
			size_t quoteStart = body.find("\"", colonPos);
			size_t quoteEnd = body.find("\"", quoteStart + 1);
			if(quoteStart != std::string::npos && quoteEnd != std::string::npos) {
				server_host = body.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
			}
		}
		size_t portPos = body.find("\"port\"");
		if(portPos != std::string::npos) {
			size_t colonPos = body.find(":", portPos);
			size_t numStart = colonPos + 1;
			while(numStart < body.size() && (body[numStart] == ' ' || body[numStart] == '\t')) numStart++;
			size_t numEnd = numStart;
			while(numEnd < body.size() && body[numEnd] >= '0' && body[numEnd] <= '9') numEnd++;
			if(numEnd > numStart) {
				port = (uint16_t)std::stoi(body.substr(numStart, numEnd - numStart));
			}
		}
		size_t tokenPos = body.find("\"token\"");
		if(tokenPos != std::string::npos) {
			size_t colonPos = body.find(":", tokenPos);
			size_t quoteStart = body.find("\"", colonPos);
			size_t quoteEnd = body.find("\"", quoteStart + 1);
			if(quoteStart != std::string::npos && quoteEnd != std::string::npos) {
				token = body.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
			}
		}
		
		if(server_host.empty() || token.empty()) {
			send_http_response(cli.s, 400, "Bad Request", "{\"error\":\"Missing server_host or token\"}");
			cli.close();
			continue;
		}
		
		// Write config.json
		std::string configJson = "{\n  \"server_host\": \"" + server_host + "\",\n  \"port\": " + std::to_string(port) + ",\n  \"token\": \"" + token + "\"\n}";
		FILE *f = fopen("config.json", "w");
		if(!f) {
			send_http_response(cli.s, 500, "Internal Server Error", "{\"error\":\"Failed to write config.json\"}");
			cli.close();
			continue;
		}
		fprintf(f, "%s", configJson.c_str());
		fclose(f);
		
		std::printf("[config] Configuration saved to config.json\n");
		std::printf("[config] Server: %s:%u, Token: %s...\n", server_host.c_str(), port, token.substr(0, 8).c_str());
		
		// Send success response
		send_http_response(cli.s, 200, "OK", "{\"success\":true,\"message\":\"Configuration saved. Restarting agent...\"}");
		cli.close();
		srv.close();
		Tcp::done();
		
		// Restart process
		char exePath[MAX_PATH];
		GetModuleFileNameA(NULL, exePath, MAX_PATH);
		
		STARTUPINFOA si = {0};
		si.cb = sizeof(si);
		PROCESS_INFORMATION pi = {0};
		
		std::string cmdLine = std::string(exePath) + " --agent --host " + server_host + " --port " + std::to_string(port) + " --token " + token;
		if(CreateProcessA(NULL, (LPSTR)cmdLine.c_str(), NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
			CloseHandle(pi.hProcess);
			CloseHandle(pi.hThread);
			std::printf("[config] Restarted as agent. Exiting config server.\n");
			return 0;
		} else {
			std::fprintf(stderr, "[config] Failed to restart (err=%lu). Please restart manually.\n", GetLastError());
			return 1;
		}
	}
	
	srv.close();
	Tcp::done();
	return 0;
}

int main(int argc,char **argv){
	// init GDI+
	ULONG_PTR gdipToken=0; 
	Gdiplus::GdiplusStartupInput gsi; 
	Gdiplus::GdiplusStartup(&gdipToken, &gsi, nullptr);
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
	
	// Parse command line arguments
	bool isServer=false,isClient=false,isAgent=false,isConfig=false,demo=false; 
	std::string host="127.0.0.1"; 
	uint16_t port=5555; 
	uint16_t configPort=12345;
	
	for(int i=1;i<argc;++i){ 
		std::string a=argv[i]; 
		if(a=="--server") isServer=true; 
		else if(a=="--client") isClient=true; 
		else if(a=="--agent") isAgent=true; 
		else if(a=="--config") isConfig=true;
		else if(a=="--demo") demo=true; 
		else if(a=="--host" && i+1<argc) host=argv[++i]; 
		else if(a=="--port" && i+1<argc) port=(uint16_t)std::stoi(argv[++i]); 
		else if(a=="--token" && i+1<argc) TOKEN=argv[++i]; 
		else if(a=="-h"||a=="--help"){ 
			std::puts("Usage:\n  remotebt_helper --server [--port 5555] [--token dev-secret]\n  remotebt_helper --client --host <ip> [--port 5555] [--token dev-secret] [--demo]\n  remotebt_helper --agent [--host <ip>] [--port 5555] [--token dev-secret]\n  remotebt_helper --config [config port defaults to 12345]\n\nModes:\n  --server : listen for commands on TCP (legacy local testing)\n  --client : send commands interactively to a remote server (dev tool)\n  --agent  : connect OUTBOUND to signaling and receive control commands (recommended)\n  --config : HTTP server for receiving configuration from web dashboard (auto mode)\n\nAuto-configuration:\n  If config.json exists and no mode specified, automatically runs as --agent with stored config."); 
			Gdiplus::GdiplusShutdown(gdipToken); 
			return 0; 
		} 
	}
	
	int selected = (isServer?1:0)+(isClient?1:0)+(isAgent?1:0)+(isConfig?1:0);
	
	// Auto mode: if no mode specified and config.json exists, read config and run as agent
	if(selected == 0) {
		std::string config_host, config_token;
		uint16_t config_port = 5555;
		if(read_config(config_host, config_port, config_token)) {
			std::printf("[auto] Found config.json, starting as agent...\n");
			std::printf("[auto] Server: %s:%u, Token: %s...\n", config_host.c_str(), config_port, config_token.substr(0, 8).c_str());
			host = config_host;
			port = config_port;
			TOKEN = config_token;
			isAgent = true;
			selected = 1;
		} else {
			// No config found, start config server
			std::printf("[auto] No config.json found. Starting configuration server...\n");
			std::printf("[auto] Please link this computer from the host dashboard.\n");
			isConfig = true;
			selected = 1;
		}
	}
	
	if(selected!=1){ 
		std::puts("Pick exactly one mode: --server OR --client OR --agent OR --config\nUse -h for help."); 
		Gdiplus::GdiplusShutdown(gdipToken); 
		return 0; 
	}

	// forward declare run_agent with reconnect + bao mat tcp

	// --- [BƯỚC 4] THAY THẾ TOÀN BỘ KHỐI auto run_agent BẰNG ĐOẠN NÀY ---
    auto run_agent = [&](const std::string &h,uint16_t p)->int{
        if(!Tcp::init()){ std::fprintf(stderr,"WSA init failed\n"); return 1; }
        int attempt=0; 
        bool stop=false; 
        
        while(!stop){
            Tcp cli; 
            SimpleTls tls; // <--- Đối tượng xử lý mã hóa
            
            // 1. Kết nối TCP
            if(!tcp_connect(h,p,cli)){
                long err = GetLastError();
                int delay = std::min(30000, (1<<std::min(attempt,10)) * 250); 
                std::fprintf(stderr,"[agent] connect failed %s:%u (err=%ld), retry in %d ms\n", h.c_str(), p, err, delay);
                sleep_ms(delay); attempt++; continue;
            }

            // 2. Bắt tay TLS (Handshake)
            std::printf("[agent] Performing TLS handshake...\n");
            if (!tls.Handshake(cli.s, h)) {
                std::fprintf(stderr, "[agent] TLS Handshake failed! (Check certs or server logs)\n");
                cli.close();
                sleep_ms(2000); attempt++; continue;
            }
            std::printf("[agent] 🔒 TLS Secure Connection Established!\n");
            
            // 3. Cập nhật trạng thái toàn cục
            attempt=0; 
            g_client_sock = cli.s; 
            g_active_tls = &tls; // <--- Kích hoạt gửi ảnh qua TLS

            // authenticate TO server
            {
                std::string line = std::string("AUTH ")+TOKEN+"\n";
                tls.Send(line.c_str(), (int)line.size());
            }
            
            // Send initial geometry
            {
                g_vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                g_vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
                g_vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                g_vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                char bufGeom[128];
                std::snprintf(bufGeom, sizeof(bufGeom), "GEOM %d %d %d %d\n", g_vx, g_vy, g_vw, g_vh);
                tls.Send(bufGeom, (int)strlen(bufGeom));
            }

            std::string acc; 
            acc.reserve(4096); 
            char buf[4096]; 
            bool authed=true;
            
            while(true){ 
                // 4. Nhận dữ liệu qua TLS (thay vì tcp_recv)
                int n = tls.Recv(buf,sizeof(buf)); 
                
                if(n<=0) break; 
                for(int i=0;i<n;++i){ 
                    char ch=buf[i]; 
                    if(ch=='\n'){ 
                        bool cont=handle_command(acc,authed); 
                        acc.clear(); 
                        if(!cont){ 
                            stop=true; 
                            break; 
                        } 
                    } else if(ch!='\r'){ 
                        acc.push_back(ch);
                    } 
                } 
                if(stop) break; 
            }
            
            // Dọn dẹp khi mất kết nối
            if(g_capture){ 
                g_capture=false; 
                if(g_capture_thread.joinable()) g_capture_thread.join(); 
            }
            
            g_active_tls = nullptr; // <--- Hủy trạng thái TLS
            g_client_sock=INVALID_SOCKET; 
            cli.close(); 
            
            if(stop) break; 
        }
        Tcp::done(); 
        return 0; 
    };
    // -------------------------------------------------------------------
	

	int rc = isServer? run_server(port) : (isClient? run_client(host,port,demo) : (isConfig? run_config_server(configPort) : run_agent(host,port)));
	Gdiplus::GdiplusShutdown(gdipToken);
	return rc;
}

