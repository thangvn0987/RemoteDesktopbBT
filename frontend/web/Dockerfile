FROM nginx:1.27-alpine

# Copy custom nginx config with explicit MIME types
COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY ./public/ .
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
