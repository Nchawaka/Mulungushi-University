const { createApp } = require('./app');
const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`CPRS API listening on http://localhost:${port}`);
  console.log(`Swagger UI:   http://localhost:${port}/api-docs`);
});
