# Study Deck

브라우저에서 바로 푸는 퀴즈 학습 웹앱입니다. 별도 서버 없이 정적 파일(HTML/CSS/JS)만으로 동작하며, GitHub Pages로 배포할 수 있습니다.

- **과목별 / 전체 풀기**, 북마크, 오답 노트, 학습 통계(날짜별·과목별), 이어풀기, 다크/라이트 테마 지원
- 모든 학습 데이터(북마크·오답·통계 등)는 **방문자 본인 브라우저(localStorage)** 에만 저장됩니다.

## 문제를 추가하는 두 가지 방법

### 1) 방문자가 직접 업로드 (개인용)
사이트에서 "퀴즈 파일 추가"로 JSON을 올리면 **그 브라우저에만** 저장됩니다. 다른 사람에게는 보이지 않습니다.

### 2) 기본 제공 문제 (모든 방문자에게 표시)
`quizzes/` 폴더의 JSON 파일들이 페이지 접속 시 자동으로 로딩됩니다. 관리자가 이 폴더를 갱신하고 커밋하면 모든 방문자에게 반영됩니다.

## 퀴즈 JSON 형식

```json
{
  "title": "퀴즈 제목",
  "subject": "과목명",
  "description": "설명(선택)",
  "questions": [
    {
      "question": "질문 내용",
      "options": ["보기1", "보기2", "보기3", "보기4"],
      "answer": 1,
      "explanation": "해설(선택)"
    }
  ]
}
```

- `answer` 는 **0부터 시작**하는 정답 보기의 인덱스입니다. (위 예시는 "보기2"가 정답)
- `subject` 를 지정하면 해당 과목으로 자동 분류되며, 없던 과목이면 자동 생성됩니다.
- 형식 견본은 루트의 `example-quiz-python.json` 을 참고하세요.

## 기본 제공 문제 매일 업데이트하기

1. `quizzes/` 폴더에 새 JSON 파일을 추가하거나 기존 파일을 수정합니다.
2. `quizzes/manifest.json` 의 목록을 갱신합니다. (아래 자동화 사용 시 생략 가능)
3. 커밋 후 push 하면 배포 사이트에 반영됩니다.

```bash
git add -A
git commit -m "퀴즈 업데이트"
git push
```

기본 제공을 **중단**하려면 `manifest.json` 목록에서 해당 파일 이름을 지우고 push 하면 됩니다. (다음 방문 시 방문자 화면에서도 자동 제거)

### manifest.json 자동 생성

`manifest.json` 을 손으로 편집하지 않아도 되도록 두 가지 도구를 제공합니다.

- **GitHub Actions** (`.github/workflows/build-manifest.yml`): `quizzes/**.json` 을 push 하면 깃허브가 `manifest.json` 을 자동으로 다시 생성해 커밋합니다. → 파일만 올리면 끝.
- **로컬 스크립트** (`update-manifest.ps1`): 로컬에서 미리 만들고 싶을 때 실행합니다.

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\update-manifest.ps1
  ```

## GitHub Pages 배포

1. GitHub에서 새 저장소를 만들고 이 프로젝트를 push 합니다.

   ```bash
   git remote add origin https://github.com/<사용자명>/<저장소>.git
   git push -u origin main
   ```

2. 저장소 **Settings → Pages** → Source 를 **Deploy from a branch**, Branch 를 **main / (root)** 로 지정하고 저장합니다.
3. 1~2분 뒤 `https://<사용자명>.github.io/<저장소>/` 에서 접속할 수 있습니다.

> 로컬에서 `index.html` 을 파일로 직접 열면(`file://`) 브라우저 보안 정책 때문에 기본 제공 문제 자동 로딩이 동작하지 않습니다. GitHub Pages 주소나 로컬 웹 서버에서 확인하세요.

## 파일 구조

```
.
├─ index.html                 # 진입 페이지
├─ styles.css                 # 스타일
├─ app.js                     # 앱 로직 (퀴즈 플레이어, 저장, 기본 문제 로딩 등)
├─ example-quiz-python.json   # 업로드 형식 예시 (5문제)
├─ update-manifest.ps1        # manifest 로컬 생성 스크립트
├─ .github/workflows/
│  └─ build-manifest.yml       # manifest 자동 생성 워크플로
└─ quizzes/                   # 기본 제공 문제
   ├─ manifest.json            # 기본 제공할 파일 목록
   ├─ python-day1.json
   └─ python-day2.json
```
