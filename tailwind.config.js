module.exports = {
  content: ['./**/*.ejs', './**/*.js'],
  theme: {
    extend: {
      colors: {
        bluePrimary: '#2C557E'
      },
      fontFamily: {
        ridibatang: ['RIDIBatang', 'serif'],
        chosun: ['ChosunCentennial', 'serif'],
        chosunkm: ['ChosunKm', 'serif'],
        gyeonggi: ['Gyeonggi_Batang_Regular', 'serif'],
        'pretendard-regular': ['Pretendard-Regular', 'sans-serif'],
        'pretendard-bold': ['Pretendard-Bold', 'sans-serif'],
        'pretendard-medium': ['Pretendard-Medium', 'sans-serif'],
        'pretendard-light': ['Pretendard-Light', 'sans-serif'],

      }
    },
    safelist: [
      'font-ridibatang', 'font-chosun',
      'font-pretendard-bold', 'font-pretendard-light',
      'font-pretendard-medium', 'font-pretendard-regular'
    ],
  }
};