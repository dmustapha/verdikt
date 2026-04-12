import { ServiceContract } from '../types.js';

export const SENTIMENT_CONTRACT: ServiceContract = {
  endpoint: '/api/sentiment',
  promised_schema: {
    score: { type: 'number', required: true, min: -1, max: 1 },
    label: { type: 'string', required: true, enum: ['positive', 'negative', 'neutral'] },
    confidence: { type: 'number', required: true, min: 0, max: 1 },
  },
  min_response_bytes: 50,
};
