import express from 'express'
import { auth } from './lib/auth';
import { toNodeHandler } from 'better-auth/node';
import cookieParser from 'cookie-parser';
import { IndexRoutes } from './routes';
import { envVars } from './config/env';
import cors from "cors"
import helmet from 'helmet';
import path from 'node:path';
import { errorHandler } from './middlewares/errorHandler';

const app = express()

if (envVars.NODE_ENV === "production") {
    app.set("trust proxy", 1)
}

app.use(helmet())

app.use(cors({
    origin: envVars.APP_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
}))

app.all('/api/auth/{*any}', toNodeHandler(auth));


app.use(express.json({ limit: "1mb" }))
app.use(cookieParser())

if (envVars.NODE_ENV === "development") {
    app.use("/uploads", express.static(path.resolve(envVars.STORAGE_LOCAL_DIR), {
        dotfiles: "deny",
        index: false,
        setHeaders: (res) => {
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        },
    }))
}



app.get("/", (_req, res) => {
    res.json({ success: true, message: "Chocofestbd API is working!" })
})
app.get("/health", (_req, res) => {
    res.json({ success: true, status: "Ok" })
})

app.use('/api/v1', IndexRoutes);

app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
})


app.use(errorHandler)

export default app;