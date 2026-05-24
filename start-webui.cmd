@echo off
set PORT=4173
start http://127.0.0.1:%PORT%
node "%~dp0serve.mjs"
