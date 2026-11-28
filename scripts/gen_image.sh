#!/usr/bin/env bash
# 게임 그림 만들기: ChatGPT 이미지 생성(Codex CLI 의 image_generation)으로 장면을 만들고 webp 로 줄여 앱에 넣는다.
# 교수님 피드백 '게임은 시각적으로 재밌어야 한다 · 이미지 → 스토리/시나리오 · ChatGPT(codex exec)로 이미지를 만들어 보자'
#
# 쓰는 법:  scripts/gen_image.sh <이름> "<장면 설명(영어)>" [비율 3:2|1:1] [폴더 story|art]
#   예)     scripts/gen_image.sh story5 "The ant opens a lucky card that glows gold."
#           scripts/gen_image.sh ev_flu "The ant in bed with a thermometer" 3:2 art
# 결과:     apps/web/public/<폴더>/<이름>.webp  (원본 png 는 임시 폴더에)
#   story/ 오프닝·엔딩 · art/ 인생 사건(ev_<사건 id>) · 행운 카드(luck_<id>) · 개미 초상(char_<id>)
# 필요:     codex(로그인), cwebp(brew install webp)
set -euo pipefail
name="${1:?이름}"; scene="${2:?장면 설명}"; ratio="${3:-3:2}"; dir="${4:-story}"
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; out="$root/apps/web/public/$dir"; mkdir -p "$out"

# 모든 장면이 같은 그림체·같은 주인공이 되도록 고정 문구를 붙인다
STYLE="Style: warm, polished 3D-animated film still (Pixar-like), soft cinematic lighting, purple/violet + warm orange palette, \
no text, no letters, no numbers, no logos, no real brands. Main character (keep exactly): a cute small ANT office worker, round head, \
glossy violet/purple body, big friendly brown eyes, two antennae with orange tips, small orange necktie, standing upright like a person. \
Side character when mentioned: a wise friendly black-and-white ORCA professor with round glasses and a bow tie, floating inside a glowing water bubble."

(cd "$tmp" && codex exec --skip-git-repo-check -s workspace-write \
  "Generate ONE image with your image generation tool and save it in the current directory as $name.png (aspect ratio $ratio). Do nothing else. $STYLE Scene: $scene" >/dev/null)

size=1440; [ "$ratio" = "1:1" ] && size=640
cwebp -quiet -q 74 -resize "$size" 0 "$tmp/$name.png" -o "$out/$name.webp"
echo "→ $out/$name.webp ($(du -h "$out/$name.webp" | cut -f1))"

# 지금 들어 있는 장면(재현용 기록)
# story1    late night tiny studio apartment, the ant sits on the bed holding a smartphone with a soaring chart, regretful sigh, moonlight
# story2    an orca professor in a glowing bubble hands the surprised ant a golden antique pocket watch with a swirling glowing face
# story3    the ant tumbles through a time tunnel of golden gears, flying calendar pages and candlestick shapes, holding the watch
# story4    bright Monday morning, determined ant by the window with a phone showing a video feed, banknotes and coffee on the desk
# end_win   rooftop at golden sunset, confetti and coins, the ant raises a trophy, the orca professor claps in his bubble
# end_learn rainy evening cafe awning, the ant writes lessons in a notebook with cocoa, the orca gives a fin thumbs-up
