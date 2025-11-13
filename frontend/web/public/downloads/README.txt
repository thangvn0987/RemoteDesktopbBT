This is a placeholder file for remotebt_helper.exe

To get the actual executable:
1. Build the C++ helper agent following instructions in helper/cpp-helper/BUILD.md
2. The build script will automatically copy it here

Or manually:
cd helper/cpp-helper
g++ -std=c++11 src/main.cpp -o build/remotebt_helper.exe -lgdiplus -lws2_32 -lgdi32 -lole32 -luuid
copy build/remotebt_helper.exe ../../frontend/web/public/downloads/remotebt_helper.exe
