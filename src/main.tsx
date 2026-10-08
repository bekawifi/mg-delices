import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConnectionStatus } from './components/ConnectionStatus'
import './index.css'
import { installSupportLogging } from './lib/supportLogs'
import { RestaurantSettingsProvider } from './contexts/RestaurantSettingsContext'

const Router=typeof window!=='undefined'&&'__TAURI_INTERNALS__'in window?HashRouter:BrowserRouter
installSupportLogging()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><Router><AuthProvider><RestaurantSettingsProvider><ConnectionStatus/><App /></RestaurantSettingsProvider></AuthProvider></Router></ErrorBoundary>
  </React.StrictMode>,
)
