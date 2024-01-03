for file in raw/*; 
do magick $file -background "#0000" -gravity center -extent "%[fx:max(w,h)]x%[fx:max(w,h)]" $(echo "$file" | sed -E 's/raw\/([^/.]*).*/\1.png/')
done