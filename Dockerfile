FROM apify/actor-node:20

COPY package*.json ./
RUN npm ci --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --omit=optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY schema ./schema
COPY .actor ./.actor

RUN npm ci \
    && npx tsc -p tsconfig.build.json \
    && npm prune --omit=dev

CMD ["npm", "run", "start:prod"]
