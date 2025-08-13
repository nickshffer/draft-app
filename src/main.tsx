import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/host" element={<App isHost={true} />} />
        <Route path="/" element={<App isHost={false} />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
