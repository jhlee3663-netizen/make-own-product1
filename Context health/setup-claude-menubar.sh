#!/bin/bash
# Claude Usage Menubar 설치 스크립트
# 이 파일을 터미널에서 실행하세요: bash setup-claude-menubar.sh

set -e

PLUGIN_DIR="$HOME/Library/Application Support/xbar/plugins"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_FILE="claude-usage-menubar.5m.py"

echo "=============================="
echo "  Claude 메뉴바 위젯 설치"
echo "=============================="
echo ""

# 1. xbar 확인
if [ ! -d "/Applications/xbar.app" ]; then
    echo "⚠️  xbar가 설치되어 있지 않습니다."
    echo ""
    echo "  아래 링크에서 xbar를 먼저 설치해주세요:"
    echo "  👉  https://xbarapp.com"
    echo ""
    echo "  설치 후 xbar를 한 번 실행한 다음, 이 스크립트를 다시 실행하세요."
    exit 0
fi

echo "✅ xbar 감지됨"

# 2. 플러그인 디렉토리 생성
mkdir -p "$PLUGIN_DIR"
echo "✅ 플러그인 폴더 준비 완료"

# 3. 플러그인 복사
cp "$SCRIPT_DIR/$PLUGIN_FILE" "$PLUGIN_DIR/$PLUGIN_FILE"
chmod +x "$PLUGIN_DIR/$PLUGIN_FILE"
echo "✅ 플러그인 설치 완료: $PLUGIN_DIR/$PLUGIN_FILE"

# 4. Python3 확인
if ! command -v python3 &> /dev/null; then
    echo ""
    echo "⚠️  python3이 없습니다. 설치 필요:"
    echo "   https://www.python.org/downloads/"
    exit 1
fi
echo "✅ Python3 확인됨: $(python3 --version)"

# 5. xbar 재시작
echo ""
echo "🔄 xbar 새로고침 중..."
open -a xbar

echo ""
echo "=============================="
echo "  설치 완료! 🎉"
echo "=============================="
echo ""
echo "  상단 메뉴바에서 🤖 아이콘을 클릭해보세요."
echo "  데이터가 없으면 'Claude Code'를 먼저 실행해주세요."
echo ""
