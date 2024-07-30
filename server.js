import express from 'express';
import cors from 'cors';
import mongodb, { MongoClient, Binary } from 'mongodb';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GridFSBucket } from 'mongodb';
import rateLimit from "express-rate-limit";

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI;

app.enable('trust proxy')

const uploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: "Too many uploads from this IP, please try again after 5 minutes"
});

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

const client = new MongoClient(mongoUri);
let collection;
let gfs;

const connectToDb = async () => {
    try {
        await client.connect();
        console.log('Connected to MongoDB!');
        const db = client.db('rift');
        collection = db.collection('files');
        gfs = new GridFSBucket(db, { bucketName: 'files' });
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    }
};

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No files were uploaded.');
    }

    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    const existingFile = await collection.findOne({ checksum: hash });
    if (existingFile !== null) {
        return res.status(500).send({ message: 'File already exists', fileId: existingFile._id, sha256: hash });
    }

    if (req.file.size > 16 * 1024 * 1024) { // File size greater than 16MB
        if (req.file.size > 128 * 1024 * 1024) {
            return res.status(400).send('File size greater than 128MB is not allowed.');
        }
        const existingFile = await gfs.find({ "metadata.checksum": hash }).toArray();
        if (existingFile.length > 0) {
            return res.status(409).send({ message: 'File already exists', fileId: existingFile[0]._id, sha256: hash });
        }
        const stream = gfs.openUploadStream(req.file.originalname, {
            metadata: {
                originalName: req.file.originalname,
                contentType: req.file.mimetype,
                size: req.file.size,
                checksum: hash,
            },
        });
        stream.end(req.file.buffer);
        stream.on('finish', () => {
            res.send({ message: 'File uploaded successfully', fileId: stream.id, sha256: hash });
        });
        stream.on('error', (err) => {
            console.error('Failed to store file in MongoDB:', err);
            res.status(500).send('Failed to upload the file.');
        });
    } else {
        const fileDocument = {
            originalName: req.file.originalname,
            contentType: req.file.mimetype,
            size: req.file.size,
            checksum: hash,
            fileData: new Binary(req.file.buffer),
        };

        try {
            const result = await collection.insertOne(fileDocument);
            res.send({ message: 'File uploaded successfully', fileId: result.insertedId, sha256: hash });
        } catch (err) {
            console.error('Failed to store file in MongoDB:', err);
            res.status(500).send('Failed to upload the file.');
        }
    }
});

app.get('/:sha', async (req, res) => {
    const { sha } = req.params;

    // Search in the regular collection first
    const fileInCollection = await collection.findOne({ checksum: sha });
    if (fileInCollection) {
        res.type(fileInCollection.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileInCollection.originalName}"`);
        const fileBuffer = fileInCollection.fileData.buffer;
        return res.send(fileBuffer);
    }

    // If not found, search in GridFS
    const fileInGridFS = await gfs.find({ "metadata.checksum": sha }).toArray();
    if (fileInGridFS.length > 0) {
        const downloadStream = gfs.openDownloadStream(fileInGridFS[0]._id);
        res.type(fileInGridFS[0].metadata.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileInGridFS[0].filename}"`);
        return downloadStream.pipe(res);
    }

    // If not found in either, return 404
    res.status(404).send('File not found');
});

const startServer = async () => {
    await connectToDb();
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
};

startServer();
