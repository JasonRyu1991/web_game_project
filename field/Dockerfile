# 채널 파드 이미지.
#
# alpine 을 쓰는 이유는 크기다. Spot 노드는 선점당하면 새 노드에서 이미지를 다시 받아야
# 하는데, 이미지가 크면 그만큼 파드가 뜨는 데 오래 걸린다. 이 프로젝트는 노드가 자주
# 갈리는 걸 전제로 하므로(선점 = 카오스 테스트) 이미지 크기가 곧 복구 속도다.
FROM node:22-alpine

WORKDIR /app

# 의존성 파일을 먼저 복사해서 install 을 따로 한 층으로 굽는다.
# 소스만 고쳤을 때 npm 설치 층을 캐시로 재사용하려는 것 — CI 빌드 시간이 크게 줄어든다.
COPY package.json package-lock.json ./

# ci 는 lock 파일 그대로 설치해서 재현성이 보장된다(install 은 lock 을 갱신할 수 있다).
# omit=dev 로 실행에 필요없는 것은 빼서 이미지를 더 줄인다.
RUN npm ci --omit=dev

# 소스는 의존성 설치가 끝난 뒤에 복사한다(위 캐시 이유).
COPY . .

# node 이미지에 기본 포함된 비루트 계정. 컨테이너가 뚫려도 root 로 뭘 하지 못하게 한다.
USER node

ENV PORT=8080
EXPOSE 8080

# npm start 로 띄우면 npm 이 PID 1 이 되어 SIGTERM 을 node 에 제대로 넘기지 않는다.
# 그러면 preStop 드레인이 통째로 망가진다 — 이 프로젝트의 알맹이라 반드시 node 를 직접 띄운다.
CMD ["node", "server.js"]
