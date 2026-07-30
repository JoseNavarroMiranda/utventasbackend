const multer = require('multer')
const path = require('path')
const fs = require('fs-extra')

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads')

fs.ensureDirSync(UPLOADS_DIR)

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
    cb(null, name)
  },
})

const fileFilter = (_req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|webp)$/i
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true)
  } else {
    cb(new Error('Solo se permiten imágenes JPG, PNG y WEBP'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
})

module.exports = upload
