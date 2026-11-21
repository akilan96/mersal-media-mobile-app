import express from 'express';
import { createExpressApi } from './backend/api';
import { createMongoStore } from './backend/mongo';

export default createExpressApi(createMongoStore(process.env.MONGODB_URI, process.env.MONGODB_DB), express());
