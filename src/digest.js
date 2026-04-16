import dotenv from 'dotenv';
import { getPendingThreads, formatDigest } from './summary.js';

dotenv.config();

const lookbackHours = Number(process.env.DIGEST_LOOKBACK_HOURS || 72);
console.log(formatDigest(getPendingThreads(lookbackHours)));
