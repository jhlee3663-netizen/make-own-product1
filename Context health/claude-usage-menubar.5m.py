#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# <xbar.title>Claude Usage Monitor</xbar.title>
# <xbar.version>v1.0</xbar.version>
# <xbar.author>Custom</xbar.author>
# <xbar.desc>Claude Code 토큰 사용량을 메뉴바에 표시합니다</xbar.desc>
# <xbar.refreshOnOpen>true</xbar.refreshOnOpen>

import json
import os
from datetime import date
from pathlib import Path

def fmt_tokens(n):
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)

# Claude Code 로그 파일 위치 (버전에 따라 다를 수 있음)
base_dirs = [
    Path.home() / ".claude" / "projects",
    Path.home() / ".config" / "claude" / "projects",
]

today = date.today().isoformat()

today_input = 0
today_output = 0
today_cache_read = 0
today_cache_create = 0
today_cost = 0.0

total_input = 0
total_output = 0
total_cost = 0.0

found_any = False

for base_dir in base_dirs:
    if not base_dir.exists():
        continue

    for jsonl_file in base_dir.rglob("*.jsonl"):
        found_any = True
        try:
            with open(jsonl_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if data.get('type') != 'assistant':
                            continue

                        msg = data.get('message', {})
                        usage = msg.get('usage', {})
                        if not usage:
                            continue

                        inp = usage.get('input_tokens', 0)
                        out = usage.get('output_tokens', 0)
                        cache_r = usage.get('cache_read_input_tokens', 0)
                        cache_c = usage.get('cache_creation_input_tokens', 0)
                        cost = data.get('costUSD', 0.0)

                        timestamp = data.get('timestamp', '')
                        entry_date = timestamp[:10] if timestamp else ''

                        total_input += inp
                        total_output += out
                        total_cost += cost

                        if entry_date == today:
                            today_input += inp
                            today_output += out
                            today_cache_read += cache_r
                            today_cache_create += cache_c
                            today_cost += cost
                    except Exception:
                        pass
        except Exception:
            pass

today_total = today_input + today_output + today_cache_read
total_all = total_input + total_output

# 캐시 효율
cache_pct = 0.0
if today_cache_read + today_input > 0:
    cache_pct = today_cache_read / (today_cache_read + today_input) * 100

# 메뉴바 텍스트 (첫 줄)
if not found_any:
    print("🤖 Claude | color=#888888")
else:
    cost_color = "#4caf50" if today_cost < 1.0 else "#e5a02e" if today_cost < 3.0 else "#f44336"
    print(f"🤖 {fmt_tokens(today_total)} · ${today_cost:.2f} | color={cost_color}")

print("---")

# 오늘 상세
print(f"📅 오늘 ({today}) | size=13 color=#aaaaaa")
print(f"총 토큰: {today_total:,} | size=12")
print(f"  ├ 입력:  {today_input:,} | size=11 color=#888888")
print(f"  ├ 출력:  {today_output:,} | size=11 color=#888888")
print(f"  └ 캐시:  {today_cache_read:,} (효율 {cache_pct:.0f}%) | size=11 color=#4caf50")
print(f"비용: ${today_cost:.4f} | size=12 color=#e5a02e")

print("---")

# 전체 누적
print(f"📊 전체 누적 | size=13 color=#aaaaaa")
print(f"총 토큰: {total_all:,} | size=12")
print(f"총 비용: ${total_cost:.2f} | size=12 color=#e5a02e")

print("---")

# 참고: Pro 플랜 한도 안내
print("ℹ️  Pro 플랜 한도는 Anthropic 미공개 | size=11 color=#888888")
print("  (일반적으로 5시간 단위 rate limit 적용) | size=11 color=#888888")

print("---")
print("🔄 새로고침 | refresh=true size=12")
