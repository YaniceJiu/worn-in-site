@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==================================================
echo   Worn-In 旧衣·新香  局域网/真机 HTTPS 模式
echo   （含泵后台：网页分析结果 -^> 串口 -^> ESP32）
echo ==================================================
echo.

REM ---------- 1) 自签名证书（如缺失才生成） ----------
if not exist certs\server.pem (
  echo [提示] 未找到证书，正在生成...
  where openssl >nul 2>nul
  if errorlevel 1 (
    echo [错误] 找不到 openssl，请先安装 OpenSSL 后重试。
    pause & exit /b 1
  )
  if not exist certs mkdir certs
  pushd certs
  openssl req -x509 -newkey rsa:2048 -nodes -config "C:\Program Files\Git\mingw64\etc\ssl\openssl.cnf" -keyout server.key -out server.pem -days 365 -subj "//CN=worn-in.local" >nul 2>nul
  popd
  if not exist certs\server.pem (
    echo [错误] 证书生成失败。
    pause & exit /b 1
  )
  echo 已生成自签名证书 certs\server.pem
)

REM ---------- 2) 启动 HTTPS 服务器（含 /pump 串口桥接） ----------
set PY=python
where python >nul 2>nul || set PY=py
REM 若自动找串口失败，把下一行改成:
REM   start "worn-in-https" %PY% server.py --https --serial-port COM3
start "worn-in-https" %PY% server.py --https
timeout /t 1 /nobreak >nul

echo.
echo ==================================================
echo 电脑 IPv4 地址（iPad 用，任选一个 192.168.x.x）:
ipconfig | findstr /c:"IPv4"
echo ==================================================
echo.
echo 使用步骤：
echo   1. iPad/手机 与电脑连「同一 WiFi」
echo   2. iPad 浏览器打开 https://上面IP:8443/play.html
echo   3. 首次提示证书不安全 -^> 选「继续访问网站」
echo      (Chrome: 高级 - 继续前往)
echo   4. 走流程：猫眼 - 拍照 - AI 分析 - 电脑自动串口指挥 ESP32 转对应泵
echo.
echo 本机测试也可直接用: python server.py  （HTTP 8904）
echo.
pause
