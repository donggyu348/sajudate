/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        // 강조색 하나만 사용 — 진지하고 신뢰감 있는 딥 인디고
        accent: {
          DEFAULT: '#4338ca', // indigo-700
          soft: '#eef2ff', // indigo-50
          ring: '#c7d2fe', // indigo-200
        },
        ink: {
          DEFAULT: '#111827', // 본문 텍스트
          soft: '#6b7280', // 서브 텍스트
        },
        line: '#e5e7eb', // 얇은 테두리
      },
      fontFamily: {
        sans: [
          'Pretendard',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      aspectRatio: {
        '4/5': '4 / 5',
      },
      maxWidth: {
        app: '480px', // 모바일 우선 컨테이너
      },
    },
  },
  plugins: [],
};
