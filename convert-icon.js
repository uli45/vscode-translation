const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 输入和输出文件路径
const svgPath = path.join(__dirname, 'icon.svg');
const pngPath = path.join(__dirname, 'icon.png');

// 确保SVG文件存在
if (!fs.existsSync(svgPath)) {
  console.error('SVG文件不存在:', svgPath);
  process.exit(1);
}

// 将SVG转换为PNG
sharp(svgPath)
  .resize(128, 128) // 确保输出大小为128x128
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log(`成功将SVG转换为PNG: ${pngPath}`);
  })
  .catch(err => {
    console.error('转换过程中出错:', err);
  });