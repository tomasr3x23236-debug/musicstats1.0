# 🎵 MusicStats — Guía de Configuración

## ¿Qué necesitas?

1. **Cuenta de Apple Developer** (gratis o de pago)
2. **Cuenta de Vercel** (gratis)
3. **Node.js 18+** instalado

---

## PASO 1 — Crear tu cuenta de Apple Developer

> Si ya tienes una cuenta, salta al Paso 2.

1. Ve a **https://developer.apple.com**
2. Haz clic en **"Account"** → inicia sesión con tu Apple ID
3. Acepta los términos (es gratis para obtener las credenciales de MusicKit)

---

## PASO 2 — Crear tu MusicKit Key

Esto te dará el acceso a la API de Apple Music.

1. En **https://developer.apple.com/account**, ve a:
   **Certificates, Identifiers & Profiles** → **Keys**

2. Haz clic en el botón **"+"** (agregar nueva key)

3. Escribe un nombre: `MusicStats Key`

4. Activa el checkbox de **MusicKit**

5. Haz clic en **Continue** → **Register**

6. **⚠️ MUY IMPORTANTE:** Descarga el archivo `.p8` que aparece.
   Solo puedes descargarlo UNA VEZ. Guárdalo en un lugar seguro.

7. Anota:
   - **Key ID** — aparece en la página (10 caracteres, ej: `ABC123DEFG`)
   - **Team ID** — aparece arriba a la derecha de tu cuenta (10 caracteres)

---

## PASO 3 — Preparar el proyecto

```bash
# Clonar / descomprimir el proyecto
cd musicstats

# Instalar dependencias
npm install

# Instalar Vercel CLI (si no lo tienes)
npm install -g vercel
```

---

## PASO 4 — Configurar variables de entorno

Abre el archivo `.p8` que descargaste con cualquier editor de texto.
Se verá así:

```
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...
(varias líneas de caracteres)
-----END PRIVATE KEY-----
```

Necesitas copiar **todo** ese contenido incluyendo los encabezados.

### En Vercel (método recomendado):

1. Ve a **https://vercel.com** → tu proyecto → **Settings** → **Environment Variables**

2. Agrega estas 3 variables:

| Nombre | Valor |
|--------|-------|
| `APPLE_KEY_ID` | Tu Key ID (ej: `ABC123DEFG`) |
| `APPLE_TEAM_ID` | Tu Team ID (ej: `XYZ987WXYZ`) |
| `APPLE_PRIVATE_KEY` | El contenido completo del archivo .p8 |

> Para `APPLE_PRIVATE_KEY`, pega el contenido tal cual, con saltos de línea.
> Vercel los manejará correctamente.

### Para desarrollo local:

Crea un archivo `.env` en la raíz del proyecto:

```env
APPLE_KEY_ID=tu_key_id_aqui
APPLE_TEAM_ID=tu_team_id_aqui
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...
-----END PRIVATE KEY-----"
```

> ⚠️ Agrega `.env` a tu `.gitignore` — nunca lo subas a GitHub.

---

## PASO 5 — Deploy en Vercel

```bash
# Login en Vercel (abrirá el navegador)
vercel login

# Deploy
vercel --prod
```

Vercel te dará una URL como: `https://musicstats-tuusuario.vercel.app`

---

## PASO 6 — Registrar tu dominio en Apple (opcional pero recomendado)

Para que Apple Music funcione correctamente en tu dominio:

1. Ve a **developer.apple.com/account** → **Identifiers** → **"+"**
2. Selecciona **App IDs** → **App**
3. Activa **MusicKit**
4. En **Domains**, agrega tu dominio de Vercel

---

## Probar sin configuración (Modo Demo)

Si no tienes las credenciales de Apple aún, la app funciona en **modo demo** automáticamente con datos de ejemplo. Puedes:

- Ver todas las estadísticas
- Simular la reproducción en tiempo real
- Registrar canciones manualmente
- Explorar todas las pantallas

---

## Estructura del proyecto

```
musicstats/
├── api/
│   └── config.js        ← Genera el token de Apple de forma segura
├── public/
│   ├── index.html       ← App principal
│   └── js/
│       └── app.js       ← Lógica + MusicKit integration
├── vercel.json          ← Configuración de Vercel
├── package.json
└── SETUP.md             ← Esta guía
```

---

## ¿Cómo funciona la integración real?

1. El servidor genera un **Developer Token** (JWT firmado con tu clave privada)
2. MusicKit JS usa ese token para mostrar el botón de autorización de Apple
3. El usuario inicia sesión con su **Apple ID** → Apple devuelve un **Music User Token**
4. La app escucha eventos de MusicKit para detectar qué canción se está reproduciendo
5. Cada reproducción se registra localmente con `localStorage`

### Limitación importante de Apple

Apple Music **no expone historial de escucha pasado** en su API pública.
La app rastrea desde el momento en que el usuario se conecta.

---

## Soporte

¿Problemas? Revisa:
- Que tu Key ID y Team ID sean correctos (exactamente 10 caracteres)
- Que el archivo .p8 esté completo (con `-----BEGIN` y `-----END`)
- Que las variables de entorno estén bien guardadas en Vercel

---

*Hecho con ❤️ — MusicStats v1.0*
