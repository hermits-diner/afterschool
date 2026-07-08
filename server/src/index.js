import app from './app.js';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  🎓  방과후학교 수강신청 서버 실행 중: http://localhost:${PORT}\n`);
});
