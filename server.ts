import express from 'express';
import { createExpressApi } from './backend/api';
import { createMongoStore } from './backend/mongo';
import { createDriveReader } from './backend/drive';

export default createExpressApi(createMongoStore(process.env.MONGODB_URI, process.env.MONGODB_DB), express(), {
  pinMode: true,
  ownerUsername: process.env.MERSAL_OWNER_USERNAME?.trim() || 'aki',
  drive: createDriveReader(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON),
});
