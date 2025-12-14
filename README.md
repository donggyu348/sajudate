# namu-web
나무그림 웹


# local db 터널링
ssh -i /Users/soas/Documents/나무그림/prod.pem \
-N -L 3307:ls-bf6a633560df15b5ac396f6c91f990459393b811.ch2egicsosuj.ap-northeast-2.rds.amazonaws.com:3306 \
bitnami@43.203.15.147