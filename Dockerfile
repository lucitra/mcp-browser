FROM node:20-slim

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY dist/ ./dist/

ENV BROWSER_HEADLESS=true
ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
