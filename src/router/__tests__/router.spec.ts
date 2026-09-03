import { describe, expect, it } from 'vitest'

import router from '@/router'

describe('application routes', () => {
  it('maps the root route to the Sepolia tool page', () => {
    const resolved = router.resolve('/')

    expect(resolved.name).toBe('ethereum-tool')
    expect(resolved.matched).toHaveLength(1)
  })
})
