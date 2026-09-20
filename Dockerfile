# 街坊库 —— 零依赖 Node.js 服务，无需 npm install
FROM node:22-alpine

WORKDIR /app

# 仅拷贝运行所需文件（无第三方依赖）
COPY server.js ./server.js
COPY seed ./seed
COPY public ./public

# 数据文件在首次启动时自动生成于 /app/data
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=8107
EXPOSE 8107

# 简单健康检查：登录页可达即视为健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8107/api/accounts',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
