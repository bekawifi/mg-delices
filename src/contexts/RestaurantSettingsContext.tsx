import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { DEFAULT_RESTAURANT_SETTINGS, type RestaurantSettings } from '../lib/settings'

interface RestaurantSettingsValue {
  settings: RestaurantSettings
  loading: boolean
  error: string | null
  refreshSettings: () => Promise<void>
  setSettings: (settings: RestaurantSettings) => void
}

const RestaurantSettingsContext=createContext<RestaurantSettingsValue|null>(null)

export function RestaurantSettingsProvider({children}:{children:ReactNode}){
  const{profile}=useAuth()
  const[settings,setSettings]=useState(DEFAULT_RESTAURANT_SETTINGS)
  const[loading,setLoading]=useState(false)
  const[error,setError]=useState<string|null>(null)
  const refreshSettings=useCallback(async()=>{
    if(!profile){setSettings(DEFAULT_RESTAURANT_SETTINGS);return}
    setLoading(true);setError(null)
    const{data,error:failure}=await supabase.rpc('get_restaurant_settings')
    if(failure)setError('Impossible de charger l’identité du restaurant.')
    else if(data)setSettings({...DEFAULT_RESTAURANT_SETTINGS,...data} as RestaurantSettings)
    setLoading(false)
  },[profile])
  useEffect(()=>{void refreshSettings()},[refreshSettings])
  const value=useMemo(()=>({settings,loading,error,refreshSettings,setSettings}),[settings,loading,error,refreshSettings])
  return <RestaurantSettingsContext.Provider value={value}>{children}</RestaurantSettingsContext.Provider>
}

export function useRestaurantSettings(){const value=useContext(RestaurantSettingsContext);if(!value)throw new Error('useRestaurantSettings doit être utilisé dans RestaurantSettingsProvider');return value}
