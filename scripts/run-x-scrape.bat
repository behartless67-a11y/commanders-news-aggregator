@echo off
rem Run by the "BurgundyWire X Scrape" Windows Scheduled Task — see
rem docs/x-browser-scraping.md. Not part of the build; never committed to
rem run anywhere but this machine, since it depends on a Chrome profile
rem that only exists here.
cd /d "C:\Users\bh4hb\Desktop\AI_Working\Commanders_News_Aggregator"
echo. >> "C:\tmp\x-scrape.log"
echo ===== %date% %time% ===== >> "C:\tmp\x-scrape.log"
"C:\Program Files\nodejs\node.exe" src\cli.js x-scrape >> "C:\tmp\x-scrape.log" 2>&1
