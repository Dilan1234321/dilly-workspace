# Dilly Desktop - Build Progress

## Completed
- [x] Next.js 14 project setup with Tailwind v4
- [x] Dark/light theme with CSS variables
- [x] Three-panel layout (sidebar + content + right panel)
- [x] Sidebar with nav, hover expand, active states, theme toggle
- [x] Right panel with Ask Dilly chat UI
- [x] Home dashboard with stat cards
- [x] Jobs page with split view (55/45)
- [x] JobCard component with accent bars, cohort badges
- [x] JobDetail component with S/G/B DimBars, Apply/Save
- [x] Real API data flowing (106 matches loading)
- [x] Keyboard navigation (arrow keys)
- [x] Tab filtering (All/Internships/Entry-level)
- [x] Readiness filtering (Ready/Almost/Gap)
- [x] Search with debounce
- [x] US/Canada filter on listings
- [x] Skeleton loaders while loading

## Bugs to Fix Next Session
- [ ] Unicode \u00b7 showing as literal text in job cards
- [ ] International listings still showing (Argentina, Colombia)
- [ ] Right panel shows both job detail AND Ask Dilly (should switch)
- [ ] Sidebar overlaps content on narrow screens

## Next Up (Phase order)
- [ ] Fix the 3 bugs above
- [ ] Right panel switching (AI chat vs job detail)
- [ ] Onboarding flow (5 screens)
- [ ] Application tracker (Kanban)
- [ ] Scores page with radar chart
- [ ] Calendar
- [ ] Leaderboard
- [ ] Desktop-only features (comparison, batch apply, company pages)
- [ ] Command palette (cmd+k)
- [ ] Polish (animations, transitions, skeleton loaders)
- [ ] Deploy to Vercel at app.hellodilly.com
