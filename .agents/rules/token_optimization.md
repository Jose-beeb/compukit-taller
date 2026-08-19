# Reglas de Optimización de Contexto y Tokens para Compukit

1. **Estado Centralizado**:
   - En cada nueva conversación, consultar primero [`PROJECT_STATE.md`](file:///d:/OneDrive%20-%20UNIVERSIDAD%20DE%20LAS%20FUERZAS%20ARMADAS%20ESPE/Documentos/Compukit/PROJECT_STATE.md) para comprender la estructura del código, el esquema de Google Sheets y el estado de avance sin necesidad de leer todos los archivos desde cero.

2. **Edición Quirúrgica de Código**:
   - No reescribir archivos enteros cuando solo se requiera modificar una función o estilo específico.
   - Utilizar las herramientas de reemplazo de contenido localizado (`replace_file_content` o `multi_replace_file_content`).

3. **Restricción de Indexación**:
   - Ignorar lectura masiva de archivos multimedia o temporales especificados en `.ignore` y `.gitignore`.

4. **Preservación de Accesibilidad**:
   - Mantener siempre las convenciones de accesibilidad para adultos mayores de 50 años (fuentes grandes `>=18px`, botones `>=56px`, contraste WCAG AAA).
