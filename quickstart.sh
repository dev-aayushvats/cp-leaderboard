#!/bin/bash

echo "Starting backend first"

cd backend
npm run dev &

echo "Starting frontend"

cd ../frontend
npm run dev