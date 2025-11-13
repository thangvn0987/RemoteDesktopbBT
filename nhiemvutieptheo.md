# **Nhiệm vụ: Xây dựng Backend và Hoàn thiện Luồng Liên kết**

Dựa trên 2 file client đã có (remotebt\_helper.exe (Source 852-853) và auto-ws-controller.html (Source 1158)), hãy tạo code cho Backend (Signaling Server) và sửa đổi các client để hoàn thiện hệ thống.

### **1\. Yêu cầu Backend (Signaling Server)**

(Sử dụng Node.js \+ ws hoặc .NET \+ SignalR)

**A. API Endpoints:**

1. **POST /hosts/generate-token** (Cho Luồng 1\)  
   * **Mục đích:** Khi Host (đã đăng nhập web) yêu cầu liên kết máy.  
   * **Logic:**  
     * Xác thực người dùng (ví dụ: host@email.com).  
     * Tạo một host\_token (token vĩnh viễn, an toàn, ngẫu nhiên).  
     * Lưu vào DB: UserID của host@email.com liên kết với host\_token.  
     * Trả về JSON:  
       {  
         "hostToken": "host\_token\_xyz789",  
         "signalingHost": "your-server-domain.com",  
         "signalingPort": 8080  
       }

2. **POST /session** (Cho Luồng 3 \- Đã có trong auto-ws-controller.html)  
   * **Mục đích:** Khi Controller (web) muốn bắt đầu kết nối.  
   * **Logic:**  
     * Xác thực người dùng (ví dụ: controller@email.com).  
     * Kiểm tra quyền "kết bạn" (Luồng 2).  
     * Tạo sessionId và controller\_token (token tạm thời).  
     * Kiểm tra xem máy Host (.exe) tương ứng có đang "Online" không.  
     * Trả về JSON:  
       {  
         "wsUrl": "ws://\[your-server-domain.com/signal\](https://your-server-domain.com/signal)",  
         "token": "controller\_token\_abc123",  
         "sessionId": "sess\_abc",  
         "helperReady": true   
       }

**B. WebSocket Server (tại /signal):**

* **Mục đích:** Quản lý kết nối và relay tin nhắn.  
* **Logic:**  
  1. **Quản lý kết nối:** Dùng một Map (hoặc Redis) để lưu các socket đang hoạt động:  
     * hostConnections: Map\<host\_token, WebSocket\>  
     * controllerSessions: Map\<sessionId, WebSocket\>  
  2. **Xử lý tin nhắn:**  
     * **Khi nhận {"type":"auth", "token":"..."}:**  
       * Nếu là host\_token\_xyz: Lưu socket vào hostConnections. Đánh dấu Host "Online".  
       * Nếu là controller\_token\_abc: Lấy sessionId từ token, lưu socket vào controllerSessions.  
     * **Khi nhận {"type":"connect", ...} từ Controller (sau auth):**  
       * Tìm socket của Host tương ứng (dựa trên quyền và sessionId).  
       * Kiểm tra quyền "Always Allow" trong DB.  
       * Nếu không có, gửi {"type":"permission\_request", ...} đến socket của Host.  
     * **Khi nhận {"type":"permission\_grant", ...} từ Host:**  
       * Bắt đầu relay.  
     * **Relay (Move, Click, Type...):** Chuyển tiếp tin nhắn JSON từ socket Controller \-\> socket Host.  
     * **Relay (Frame, Geom, Welcome...):** Chuyển tiếp tin nhắn JSON từ socket Host \-\> socket Controller.

### **2\. Yêu cầu sửa đổi remotebt\_helper.exe (Host Agent)**

**Mục đích:** Thêm "Chế độ Chờ Cấu hình" (Config Mode) cho Luồng 1\.

1. **Logic khởi động:**  
   * Khi .exe khởi động, nó kiểm tra file config.json.  
   * **Nếu có config.json:** Chạy ở chế độ \--agent (như hiện tại), đọc host, port, token từ file.  
   * **Nếu không có config.json:**  
     * Khởi động một server HTTP nhỏ, chỉ lắng nghe trên http://localhost:12345.  
     * Chờ một yêu cầu POST duy nhất đến /.  
2. **Xử lý POST / (tại localhost:12345):**  
   * Đọc JSON body (sẽ nhận được từ Web App của Host).  
   * Lưu nội dung JSON đó vào config.json.  
   * Tự động thoát (exit) và chạy lại (re-launch) chính file .exe đó. (Lần này nó sẽ đọc config.json và chạy ở chế độ \--agent).

### **3\. Yêu cầu sửa đổi auto-ws-controller.html (Web App)**

**Mục đích:** Thêm nút "Liên kết máy" cho Host (Luồng 1).

1. **Thêm HTML (vào auto-ws-controller.html hoặc trang dashboard):**  
   * Thêm một fieldset mới, chỉ hiển thị nếu người dùng là Host:  
     \<fieldset id="host-linking" style="display:none;"\>  
       \<legend\>Dành cho Chủ máy (Host)\</legend\>  
       \<button id="btnLinkHost"\>Liên kết máy tính này\</button\>  
       \<span id="link-status"\>\</span\>  
     \</fieldset\>

   * (Bạn sẽ cần logic để display:block nếu người dùng đăng nhập là Host).  
2. **Thêm JavaScript:**  
   // (Bổ sung vào phần \<script\> của auto-ws-controller.html)

   // (Giả sử bạn có logic kiểm tra vai trò, ví dụ: isHost \= true)  
   if (true /\* isHost \*/) {  
     document.getElementById("host-linking").style.display \= "block";  
   }

   document.getElementById("btnLinkHost").onclick \= async () \=\> {  
     const statusEl \= document.getElementById("link-status");  
     statusEl.textContent \= "Đang lấy token...";  
     try {  
       // 1\. Gọi Backend của BẠN để lấy token  
       const resp \= await fetch("/hosts/generate-token", { method: "POST" });  
       if (\!resp.ok) throw new Error("Không thể lấy token từ server.");

       const { hostToken, signalingHost, signalingPort } \= await resp.json();

       statusEl.textContent \= "Đã có token\! Đang gửi đến .exe...";

       // 2\. Gửi token xuống .exe đang chạy trên localhost  
       await fetch("http://localhost:12345", {  
         method: "POST",  
         headers: { "Content-Type": "application/json" },  
         body: JSON.stringify({  
           mode: "agent",  
           host: signalingHost,  
           port: signalingPort,  
           token: hostToken  
         })  
       });

       statusEl.className \= "ok";  
       statusEl.textContent \= "Liên kết thành công\! .exe sẽ tự khởi động lại.";  
     } catch (err) {  
       statusEl.className \= "err";  
       statusEl.textContent \= "Lỗi: Không tìm thấy file .exe. Bạn đã chạy nó chưa?";  
       console.error("Link error:", err);  
     }  
   };  
