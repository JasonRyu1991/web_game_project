#Spot 노드는 선점당하면 새 노드에서 이미지를 다시 받는다. 이미지가 작아야 파드가 빨리 뜬다.
FROM node:22-alpine

WORKDIR /app

#package.json 만 먼저 복사해서 npm 설치를 별도 층으로 굽는다. 소스만 고쳤을 때 이 층을 캐시로 재사용한다.
#그래서 COPY . . 이 아래에 따로 떨어져 있는 것이다.
COPY package.json package-lock.json ./

#ci 는 lock 파일 그대로 설치해서 재현성이 보장된다. install 은 lock 을 갱신해버린다.
RUN npm ci --omit=dev

COPY . .

#node 이미지에 기본으로 들어있는 비루트 계정. 뚫려도 root 로 뭘 하지 못하게.
USER node

ENV PORT=8080
EXPOSE 8080

#npm start 로 띄우면 npm 이 PID 1 이 되어서 SIGTERM 을 node 에 안 넘겨준다. 그러면 드레인이 통째로 망가진다.
#이 프로젝트의 알맹이라 반드시 node 를 직접 띄운다.
CMD ["node", "server.js"]
