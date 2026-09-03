import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'ethereum-tool',
      component: () => import('@/views/EthereumToolView.vue'),
    },
  ],
})

export default router
