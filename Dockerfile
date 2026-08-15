FROM apify/actor-node:20

COPY package*.json ./

# The base image sets NODE_ENV=production, which would skip typescript.
RUN npm ci --include=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY schema ./schema
COPY .actor ./.actor

RUN ./node_modules/.bin/tsc -p tsconfig.build.json \
    && npm prune --omit=dev

CMD ["npm", "run", "start:prod"]
