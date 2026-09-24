# CAD Service (`services/cad-service`)

High-performance 3D CAD geometry generation and export engine for the AI CAD Platform.

---

## 🏗 Features

- **OpenCASCADE Engine**: Uses `opencascade.js` WebAssembly to compute real CAD solids, fillets, cuts, and booleans.
- **Parametric Script Runner**: Evaluates parametric Replicad TypeScript code with sandboxing and execution timeouts.
- **Physical Metrics**: Computes exact bounding box, dimensions, volume ($\text{mm}^3$), and mesh vertex/triangle counts.
- **Multi-format Exporters**:
  - **`.STEP`** (ISO-10303-21) for SolidWorks, Fusion 360, FreeCAD, AutoCAD.
  - **`.STL`** (binary mesh) for 3D printing and slicers (PrusaSlicer, Cura, Bambu Studio).
  - **`.DXF`** for laser cutting, CNC routing, and 2D CAD drafting.
- **Dual Protocols**:
  - **HTTP REST API** on port `8002` (for frontend, cURL, Postman).
  - **gRPC API** on port `50051` (implements `common/proto/cad.proto` for internal service-to-service communication).
- **In-Memory LRU Cache**: Instant millisecond responses for recurring models and export formats.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```

### 3. Run Tests
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 📡 API Endpoints

### 1. Generate Model Metrics
```http
POST /api/v1/cad/generate
Content-Type: application/json

{
  "script": "const { drawCircle } = replicad; function main({ radius = 10, height = 20 }) { return drawCircle(radius).sketchOnPlane().extrude(height); } module.exports = main;",
  "parameters": { "radius": 15, "height": 30 }
}
```

### 2. Export Model
```http
POST /api/v1/cad/export
Content-Type: application/json

{
  "modelId": "<model_id>",
  "format": "step"
}
```

### 3. Download Generated File
```http
GET /api/v1/cad/download/:modelId/:format
```
Formats: `step`, `stl`, `dxf`.
