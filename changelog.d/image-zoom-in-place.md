- **Zoom con los dedos en la propia pantalla.** Una imagen se amplía pellizcándola
  donde está, sin abrir nada: crece bajo los dedos por encima de la página y vuelve
  a su sitio al soltarla. Tocarla sigue abriendo el visor a pantalla completa, donde
  se queda ampliada para leerla; un toque doble lo abre ya ampliado en ese punto.
  Los gestos del visor ya no se traban: siguen a los dedos, tienen inercia y ceden
  al llegar al borde, y la imagen se ve nítida al ampliarla también en Android.

  Ahora también hacen zoom las imágenes adicionales de carteles, lugares, barrios,
  grupos y acontecimientos, y la del evento dentro de un grupo; antes solo la primera.

  Va sobre `react-native-gesture-handler` y `react-native-reanimated`, que ya estaban
  enlazados en todos los binarios a través de `expo-router`, ahora como dependencias
  directas. Eso cambia la huella nativa, así que llega con el próximo binario de tienda.
