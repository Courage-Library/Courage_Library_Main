import os

base_url = "https://couragelibrary.in/images/"
folder_path = "images"

print('<?xml version="1.0" encoding="UTF-8"?>')
print('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
print('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">')

print("<url>")
print("<loc>https://couragelibrary.in/</loc>")

for file in os.listdir(folder_path):
    if file.endswith(('.png', '.jpg', '.jpeg', '.webp')):
        print(f"<image:image><image:loc>{base_url}{file}</image:loc></image:image>")

print("</url>")
print("</urlset>")