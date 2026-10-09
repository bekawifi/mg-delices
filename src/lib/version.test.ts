import{describe,expect,it}from'vitest'
import{APP_IDENTIFIER,APP_NAME,APP_VERSION}from'./version'
describe('version application',()=>{it('expose une version semantique unique',()=>{expect(APP_NAME).toBe('RestoPRO');expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);expect(APP_IDENTIFIER).toBe('com.restopro.desktop')})})
