cmake_minimum_required(VERSION 3.18)

project(RemoteBTHelper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Prefer static MSVC runtime to avoid VC++ Redistributable dependency
if(MSVC)
  # CMake 3.15+: use CMAKE_MSVC_RUNTIME_LIBRARY
  if(POLICY CMP0091)
    cmake_policy(SET CMP0091 NEW)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  else()
    # Fallback for older CMake: add /MT flags manually
    foreach(flag_var
        CMAKE_C_FLAGS CMAKE_C_FLAGS_DEBUG CMAKE_C_FLAGS_RELEASE
        CMAKE_CXX_FLAGS CMAKE_CXX_FLAGS_DEBUG CMAKE_CXX_FLAGS_RELEASE)
      if(${flag_var} MATCHES "/MD")
        string(REGEX REPLACE "/MD" "/MT" ${flag_var} "${${flag_var}}")
      else()
        set(${flag_var} "${${flag_var}} /MT")
      endif()
    endforeach()
  endif()
endif()

add_executable(remotebt_helper
  src/main.cpp
)

if(WIN32)
  target_compile_definitions(remotebt_helper PRIVATE _WIN32_WINNT=0x0A00 UNICODE _UNICODE)
  target_link_libraries(remotebt_helper PRIVATE ws2_32 Gdiplus Ole32)
  # Optimize release size a bit
  target_compile_options(remotebt_helper PRIVATE $<$<CONFIG:Release>:/O2 /GL>)
  target_link_options(remotebt_helper PRIVATE $<$<CONFIG:Release>:/OPT:REF /OPT:ICF /LTCG>)
endif()
