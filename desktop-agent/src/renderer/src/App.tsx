import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Command,
  Ellipsis,
  Hash,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  Sparkles,
  Square,
  UserRound,
  X,
} from 'lucide-react'

type TaskStatus = 'todo' | 'active' | 'waiting' | 'done'
type AgentState = 'idle' | 'running' | 'waiting' | 'done'
type Task = {
  id: string
  title: string
  project: string
  status: TaskStatus
  agent: string | null
  owner?: string | null
  due: string
  priority: 'high' | 'normal' | 'low'
  notes: string
}
type AgentEvent = {
  id: string
  taskId: string
  message: string
  time: string
  kind: 'start' | 'progress' | 'waiting' | 'done'
}
type ChatMessage = { role: 'user' | 'assistant'; content: string }
type NotionPage = { id: string; title: string; url: string; lastEditedTime: string }

const initialTasks: Task[] = [
  { id: 't1', title: '整理本周内容选题与发布节奏', project: '内容运营', status: 'active', agent: '内容助理', due: '今天', priority: 'high', notes: '围绕秋季面料主题，整理 3 个选题方向。' },
  { id: 't2', title: '汇总 Instagram 本周数据', project: '社交媒体', status: 'waiting', agent: '数据助理', due: '今天', priority: 'normal', notes: '授权接入后读取账号 Insights；当前等待连接。' },
  { id: 't3', title: '拍摄新品细节图', project: 'Worn-In 秋季系列', status: 'todo', agent: null, due: '明天', priority: 'high', notes: '' },
  { id: 't4', title: '更新 Notion 发布日历', project: '内容运营', status: 'todo', agent: null, due: '周五', priority: 'normal', notes: '' },
  { id: 't5', title: '确认 TikTok 下周视频脚本', project: '社交媒体', status: 'done', agent: '内容助理', due: '昨天', priority: 'low', notes: '' },
]

const initialEvents: AgentEvent[] = [
  { id: 'e1', taskId: 't1', message: '正在整理本周的灵感和素材', time: '刚刚', kind: 'progress' },
  { id: 'e2', taskId: 't2', message: '等待 Instagram 官方授权连接', time: '12 分钟前', kind: 'waiting' },
  { id: 'e3', taskId: 't5', message: '脚本初稿已完成', time: '昨天', kind: 'done' },
]

const requestedModuleTasks: Omit<Task, 'id'>[] = [
  { title: '撕纸视频英文', project: '内容与视频制作', status: 'done', agent: null, owner: 'Angela', due: '11-11', priority: 'normal', notes: '' },
  { title: '剪撕纸视频中文', project: '内容与视频制作', status: 'done', agent: null, owner: 'Angela', due: '11-11', priority: 'normal', notes: '' },
  { title: 'Worn-In 网站宣传视频 x2', project: '内容与视频制作', status: 'todo', agent: null, owner: 'Janice', due: '11-10', priority: 'normal', notes: '' },
  { title: 'BU popup 机器', project: '线下快闪与机器运营', status: 'todo', agent: null, owner: 'Angela / Janice', due: '11-13', priority: 'normal', notes: '' },
  { title: 'Boston Common popup 机器', project: '线下快闪与机器运营', status: 'done', agent: null, owner: 'Angela / Janice', due: '11-11', priority: 'normal', notes: '' },
  { title: '做展板', project: '设计物料', status: 'active', agent: null, owner: 'Angela', due: '10-22', priority: 'normal', notes: '' },
  { title: '101 第三课海报', project: '设计物料', status: 'done', agent: null, owner: 'Angela', due: '11-03', priority: 'normal', notes: '' },
  { title: '101 第三课宣传文案和发布', project: '课程与 Workshop 运营', status: 'todo', agent: null, owner: 'Vita', due: '11-03', priority: 'normal', notes: '' },
  { title: 'Workshop 找 influencer 体验', project: '课程与 Workshop 运营', status: 'todo', agent: null, owner: 'Vita', due: '10-21', priority: 'normal', notes: '' },
  { title: '每个香水的拼贴程序', project: '产品与网站开发', status: 'active', agent: null, owner: 'Janice', due: '11-09', priority: 'normal', notes: '' },
  { title: '线上撕纸交互游戏', project: '产品与网站开发', status: 'todo', agent: null, owner: 'Janice', due: '11-10', priority: 'normal', notes: '' },
  { title: '给 Idee Fixe Studio 写 Substack', project: '合作与外联', status: 'todo', agent: null, owner: 'Angela', due: '11-12', priority: 'normal', notes: '' },
  { title: '官号 vs 私人号发什么', project: '策略思考', status: 'todo', agent: null, owner: null, due: '11-16', priority: 'normal', notes: '' },
  { title: '寻找 influencers', project: '策略思考', status: 'todo', agent: null, owner: null, due: '11-16', priority: 'normal', notes: '' },
  { title: '升级机器流动摊位', project: '策略思考', status: 'todo', agent: null, owner: null, due: '11-16', priority: 'normal', notes: '' },
  { title: '手撕拼贴全平台发布（8 个渠道）', project: '社媒分发', status: 'todo', agent: null, owner: null, due: '11-11', priority: 'normal', notes: '' },
  { title: 'Worn-In 网站宣传多平台发布（3 个渠道）', project: '社媒分发', status: 'todo', agent: null, owner: null, due: '11-10', priority: 'normal', notes: '' },
]

const columns: { id: TaskStatus; label: string; icon: typeof Circle }[] = [
  { id: 'todo', label: '待处理', icon: Circle },
  { id: 'active', label: '进行中', icon: Activity },
  { id: 'waiting', label: '等你确认', icon: Clock3 },
  { id: 'done', label: '已完成', icon: CheckCircle2 },
]

const statusNames: Record<TaskStatus, string> = {
  todo: '待处理',
  active: '进行中',
  waiting: '等你确认',
  done: '已完成',
}

const eventIcons = {
  start: Play,
  progress: Activity,
  waiting: Pause,
  done: Check,
}

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch (error) {
    console.error(`Unable to load ${key} from local storage`, error)
    return fallback
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') || fallback
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => loadSaved('daymark.tasks', initialTasks))
  const [events, setEvents] = useState<AgentEvent[]>(() => loadSaved('daymark.events', initialEvents))
  const [selectedTask, setSelectedTask] = useState<string | null>('t1')
  const [activeNav, setActiveNav] = useState('工作台')
  const [query, setQuery] = useState('')
  const [addingTo, setAddingTo] = useState<TaskStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [chatText, setChatText] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState<Record<string, AgentState>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deepSeekKey, setDeepSeekKey] = useState('')
  const [deepSeekConfigured, setDeepSeekConfigured] = useState(false)
  const [deepSeekEncryptionAvailable, setDeepSeekEncryptionAvailable] = useState(false)
  const [deepSeekSaving, setDeepSeekSaving] = useState(false)
  const [deepSeekError, setDeepSeekError] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatStatus, setChatStatus] = useState('')
  const [notionToken, setNotionToken] = useState('')
  const [notionConfigured, setNotionConfigured] = useState(false)
  const [notionEncryptionAvailable, setNotionEncryptionAvailable] = useState(false)
  const [notionSaving, setNotionSaving] = useState(false)
  const [notionTesting, setNotionTesting] = useState(false)
  const [notionSearching, setNotionSearching] = useState(false)
  const [notionConnectedAs, setNotionConnectedAs] = useState('')
  const [notionError, setNotionError] = useState('')
  const [notionSearchInfo, setNotionSearchInfo] = useState('')
  const [notionQuery, setNotionQuery] = useState('')
  const [notionPageLink, setNotionPageLink] = useState('')
  const [notionResults, setNotionResults] = useState<NotionPage[]>([])
  const [notionAddingPage, setNotionAddingPage] = useState(false)
  const [selectedNotionPages, setSelectedNotionPages] = useState<NotionPage[]>(() => loadSaved('daymark.notionPages', []))

  useEffect(() => {
    let active = true
    void window.desktop.deepseek.status().then((status) => {
      if (!active) return
      setDeepSeekConfigured(status.configured)
      setDeepSeekEncryptionAvailable(status.encryptionAvailable)
    }).catch((error: unknown) => {
      console.error('Unable to read DeepSeek configuration', error)
      if (active) setDeepSeekError(error instanceof Error ? error.message : '读取 DeepSeek 配置失败。')
    })
    void window.desktop.notion.status().then((status) => {
      if (!active) return
      setNotionConfigured(status.configured)
      setNotionEncryptionAvailable(status.encryptionAvailable)
    }).catch((error: unknown) => {
      console.error('Unable to read Notion configuration', error)
      if (active) setNotionError(error instanceof Error ? error.message : '读取 Notion 配置失败。')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const importKey = 'daymark.initialNotionTaskModulesImported.v1'
    if (localStorage.getItem(importKey)) return

    const knownTitles = new Set(tasks.map((task) => task.title.trim().toLocaleLowerCase()))
    const additions = requestedModuleTasks
      .filter((task) => !knownTitles.has(task.title.trim().toLocaleLowerCase()))
      .map((task, index): Task => ({ ...task, id: `notion-import-${Date.now()}-${index}` }))
    const next = [...tasks, ...additions]
    if (additions.length > 0) {
      setTasks(next)
      localStorage.setItem('daymark.tasks', JSON.stringify(next))
    }
    localStorage.setItem(importKey, 'true')
  }, [])

  const selected = tasks.find((task) => task.id === selectedTask) ?? null
  const filteredTasks = useMemo(
    () => tasks.filter((task) => `${task.title} ${task.project}`.toLowerCase().includes(query.toLowerCase())),
    [tasks, query],
  )

  function saveTasks(next: Task[]) {
    setTasks(next)
    localStorage.setItem('daymark.tasks', JSON.stringify(next))
  }

  function saveEvents(next: AgentEvent[]) {
    setEvents(next)
    localStorage.setItem('daymark.events', JSON.stringify(next))
  }

  function addTask(status: TaskStatus) {
    const title = draft.trim()
    if (!title) return
    const task: Task = {
      id: `t${Date.now()}`,
      title,
      project: '个人工作',
      status,
      agent: null,
      due: '未设置',
      priority: 'normal',
      notes: '',
    }
    saveTasks([task, ...tasks])
    setSelectedTask(task.id)
    setDraft('')
    setAddingTo(null)
  }

  function updateTask(id: string, changes: Partial<Task>) {
    saveTasks(tasks.map((task) => task.id === id ? { ...task, ...changes } : task))
  }

  function runDemoAgent(task: Task) {
    if (running[task.id] === 'running') return
    const agent = task.agent ?? '工作助理'
    const startEvent: AgentEvent = {
      id: `e${Date.now()}`,
      taskId: task.id,
      message: `${agent} 开始处理任务（演示运行）`,
      time: '刚刚',
      kind: 'start',
    }
    setRunning((current) => ({ ...current, [task.id]: 'running' }))
    updateTask(task.id, { agent, status: 'active' })
    saveEvents([startEvent, ...events])
    window.setTimeout(() => {
      const progressEvent: AgentEvent = {
        id: `e${Date.now() + 1}`,
        taskId: task.id,
        message: '已拆解任务步骤，等待接入真实 Agent 执行器',
        time: '刚刚',
        kind: 'waiting',
      }
      setRunning((current) => ({ ...current, [task.id]: 'waiting' }))
      updateTask(task.id, { status: 'waiting' })
      setEvents((current) => {
        const next = [progressEvent, ...current]
        localStorage.setItem('daymark.events', JSON.stringify(next))
        return next
      })
    }, 1400)
  }

  async function saveDeepSeekKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!deepSeekKey.trim()) {
      setDeepSeekError('请粘贴 DeepSeek API Key 后再保存。')
      return
    }
    setDeepSeekSaving(true)
    setDeepSeekError('')
    try {
      const result = await window.desktop.deepseek.saveKey(deepSeekKey)
      setDeepSeekConfigured(result.configured)
      setDeepSeekKey('')
    } catch (error) {
      console.error('Unable to save DeepSeek API key', error)
      setDeepSeekError(error instanceof Error ? error.message : '保存 DeepSeek API Key 失败。')
    } finally {
      setDeepSeekSaving(false)
    }
  }

  async function saveNotionToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!notionToken.trim()) {
      setNotionError('请粘贴 Notion integration token 后再保存。')
      return
    }
    setNotionSaving(true)
    setNotionError('')
    try {
      const result = await window.desktop.notion.saveToken(notionToken)
      setNotionConfigured(result.configured)
      setNotionConnectedAs('')
      setNotionToken('')
    } catch (error) {
      console.error('Unable to save Notion integration token', error)
      setNotionError(getErrorMessage(error, '保存 Notion token 失败。'))
    } finally {
      setNotionSaving(false)
    }
  }

  async function testNotionConnection() {
    setNotionTesting(true)
    setNotionError('')
    try {
      const result = await window.desktop.notion.testConnection()
      setNotionConfigured(true)
      setNotionConnectedAs(result.name)
    } catch (error) {
      console.error('Notion connection test failed', error)
      setNotionError(getErrorMessage(error, 'Notion 连接测试失败。'))
    } finally {
      setNotionTesting(false)
    }
  }

  async function searchNotion() {
    if (!notionConfigured) {
      setNotionError('先保存 Notion integration token，再搜索页面。')
      return
    }
    setNotionSearching(true)
    setNotionError('')
    setNotionSearchInfo('')
    try {
      const results = await window.desktop.notion.searchPages(notionQuery)
      setNotionResults(results)
      if (results.length === 0) {
        setNotionSearchInfo(
          notionQuery.trim()
            ? 'Notion 的标题搜索暂时没有返回结果。它不是完整清单，刚分享的页面也可能尚未进入搜索索引。'
            : 'Notion 没有列出页面。搜索列表不是完整清单；可直接粘贴页面链接，检查该页面是否已授权。',
        )
      } else {
        setNotionSearchInfo(`返回 ${results.length} 个页面。Notion 搜索不保证列出工作区中的所有页面。`)
      }
    } catch (error) {
      console.error('Notion page search failed', error)
      setNotionError(getErrorMessage(error, '搜索 Notion 页面失败。'))
    } finally {
      setNotionSearching(false)
    }
  }

  async function addNotionPage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!notionConfigured) {
      setNotionError('先保存 Notion integration token，再添加页面。')
      return
    }
    setNotionAddingPage(true)
    setNotionError('')
    setNotionSearchInfo('')
    try {
      const page = await window.desktop.notion.addPage(notionPageLink)
      setNotionResults((current) => current.some((item) => item.id === page.id) ? current : [page, ...current])
      const alreadySelected = selectedNotionPages.some((item) => item.id === page.id)
      if (!alreadySelected && selectedNotionPages.length >= 5) {
        setNotionSearchInfo(`已确认页面「${page.title}」可访问，但已经选满 5 个页面；先移除一个再选择它。`)
      } else {
        const next = alreadySelected ? selectedNotionPages : [...selectedNotionPages, page]
        setSelectedNotionPages(next)
        localStorage.setItem('daymark.notionPages', JSON.stringify(next))
        setNotionSearchInfo(`已验证并选中「${page.title}」。`)
      }
      setNotionPageLink('')
    } catch (error) {
      console.error('Unable to add Notion page by link', error)
      setNotionError(getErrorMessage(error, '读取页面失败。请确认页面链接正确，且 integration 有权访问该页面。'))
    } finally {
      setNotionAddingPage(false)
    }
  }

  function toggleNotionPage(page: NotionPage) {
    setSelectedNotionPages((current) => {
      const next = current.some((item) => item.id === page.id)
        ? current.filter((item) => item.id !== page.id)
        : current.length < 5
          ? [...current, page]
          : current
      localStorage.setItem('daymark.notionPages', JSON.stringify(next))
      return next
    })
  }

  async function sendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = chatText.trim()
    if (!text || chatLoading) return
    if (!deepSeekConfigured) {
      setChatMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: '请先打开左侧「设置」，保存 DeepSeek API Key 后再开始聊天。' }])
      setChatText('')
      return
    }

    const conversation = [...chatMessages, { role: 'user' as const, content: text }]
    setChatMessages([...conversation, { role: 'assistant', content: '' }])
    setChatText('')
    setChatLoading(true)
    setChatStatus(selectedNotionPages.length ? '正在读取选中的 Notion 页面…' : '正在连接 DeepSeek…')
    const taskContext = tasks.map((task) =>
      `- ${task.title}｜${task.project}｜${statusNames[task.status]}｜负责人：${task.owner ?? task.agent ?? '未分配'}｜截止：${task.due}`,
    ).join('\n')
    const unsubscribe = window.desktop.deepseek.onStream((message) => {
      if (message.kind === 'chunk' && message.value) {
        setChatMessages((current) => current.map((item, index) =>
          index === current.length - 1 && item.role === 'assistant'
            ? { ...item, content: item.content + message.value }
            : item,
        ))
      } else if (message.kind === 'error') {
        setChatMessages((current) => current.map((item, index) =>
          index === current.length - 1 && item.role === 'assistant'
            ? { ...item, content: `连接失败：${message.value ?? '未知错误'}` }
            : item,
        ))
      } else if (message.kind === 'status') {
        setChatStatus(message.value ?? '正在处理…')
      } else if (message.kind === 'done') {
        setChatStatus('')
      }
    })
    try {
      await window.desktop.deepseek.chat(conversation, taskContext, selectedNotionPages.map((page) => page.id))
    } catch (error) {
      console.error('DeepSeek chat request failed', error)
      setChatMessages((current) => current.map((item, index) =>
        index === current.length - 1 && item.role === 'assistant'
        ? { ...item, content: `连接失败：${getErrorMessage(error, '请检查网络和设置。')}` }
          : item,
      ))
    } finally {
      unsubscribe()
      setChatLoading(false)
      setChatStatus('')
    }
  }

  const taskEvents = selected ? events.filter((event) => event.taskId === selected.id) : []

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={17} /></div>
          <div><strong>daymark</strong><span>YOUR WORK, IN FLOW</span></div>
          <button className="icon-button sidebar-collapse" aria-label="收起侧边栏"><ArrowDown size={15} /></button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">W</div>
          <div className="workspace-copy"><strong>Worn-In Studio</strong><span>个人工作区</span></div>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav" aria-label="主导航">
          <div className="nav-caption">工作区</div>
          {[
            { label: '工作台', icon: LayoutDashboard },
            { label: '我的任务', icon: ListTodo, count: String(tasks.filter((task) => task.status !== 'done').length) },
            { label: 'Agent 活动', icon: Bot, count: '2' },
          ].map(({ label, icon: Icon, count }) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'selected' : ''}`} onClick={() => setActiveNav(label)}>
              <Icon size={17} /><span>{label}</span>{count && <span className="nav-count">{count}</span>}
            </button>
          ))}
          <div className="nav-caption projects-caption">项目</div>
          {[...new Set(tasks.map((task) => task.project))].map((project, index) => (
            <button className="nav-item project-item" key={project} onClick={() => setQuery(project)}>
              <span className={`project-dot dot-${index % 3}`} /><span>{project}</span><Ellipsis size={15} className="project-more" />
            </button>
          ))}
          <button className="nav-add" onClick={() => { setAddingTo('todo'); setDraft('') }}><Plus size={15} />新建任务</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="pet-card">
          <div className="pet-face">✳</div>
          <div className="pet-copy"><strong>小搭档正在休息</strong><span>连接 Agent 后开始协作</span></div>
          <span className="online-dot" />
        </div>
        <button className="nav-item settings-link" onClick={() => { setActiveNav('设置'); setSettingsOpen(true) }}><Settings2 size={17} /><span>设置</span></button>
        <div className="profile">
          <div className="profile-avatar">J</div>
          <div className="profile-copy"><strong>Janic</strong><span>本地工作区</span></div>
          <Ellipsis size={17} />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>工作区</span><span className="crumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="top-actions">
            <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务..." /><kbd><Command size={11} /> K</kbd></div>
            <button className="icon-button notification-button" aria-label="通知"><Bell size={17} /><i /></button>
            <div className="top-divider" />
            <button className="help-button"><span>?</span>帮助</button>
          </div>
        </header>

        <div className="page-scroll">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />星期五 · 11 月 14 日</div>
              <h1>把重要的事，<em>一步步做好。</em></h1>
              <p className="welcome-subtitle">这里是你的工作指挥台。任务、进度与 Agent 动态，一目了然。</p>
            </div>
            <button className="primary-button" onClick={() => { setAddingTo('todo'); setDraft('') }}><Plus size={16} />新建任务</button>
          </section>

          <section className="stat-grid" aria-label="任务概况">
            <div className="stat-card"><div className="stat-label">今日聚焦 <span className="stat-icon focus-icon"><Sparkles size={15} /></span></div><div className="stat-value">{tasks.filter((task) => task.due === '今天' && task.status !== 'done').length}<span> 项待完成</span></div><div className="stat-foot"><span className="mini-bar"><i /></span>保持一点点进展</div></div>
            <div className="stat-card"><div className="stat-label">进行中的任务 <span className="stat-icon activity-icon"><Activity size={15} /></span></div><div className="stat-value">{tasks.filter((task) => task.status === 'active').length}<span> 项</span></div><div className="stat-foot"><span className="live-pulse" />{Object.values(running).filter((value) => value === 'running').length} 个 Agent 运行中</div></div>
            <div className="stat-card"><div className="stat-label">本周已完成 <span className="stat-icon done-icon"><Check size={15} /></span></div><div className="stat-value">{tasks.filter((task) => task.status === 'done').length}<span> 项</span></div><div className="stat-foot">一步一步，做得很好</div></div>
            <div className="stat-card agent-stat"><div className="stat-label">Agent 状态 <span className="stat-icon bot-icon"><Bot size={15} /></span></div><div className="agent-stat-value"><span className="live-pulse" />{deepSeekConfigured ? '对话可用' : '等待接入'}</div><div className="stat-foot">{deepSeekConfigured ? 'DeepSeek 已连接 · 执行器未接入' : '演示看板 · 尚未连接真实 Agent'}</div></div>
          </section>

          <section className="board-section">
            <div className="section-heading">
              <div><h2>任务看板</h2><p>安排工作，也可以交给 Agent 协助</p></div>
              <div className="board-tools"><button className="filter-button"><span className="filter-avatar">J</span>分配给我<ChevronDown size={14} /></button><button className="sort-button"><ArrowUpRight size={15} />排序</button><button className="icon-button more-button" aria-label="更多"><Ellipsis size={18} /></button></div>
            </div>
            <div className="board-grid">
              {columns.map(({ id, label, icon: Icon }) => {
                const items = filteredTasks.filter((task) => task.status === id)
                return <section className="board-column" key={id}>
                  <div className="column-heading"><div className={`column-icon ${id}`}><Icon size={14} /></div><h3>{label}</h3><span className="column-count">{items.length}</span><button className="icon-button column-menu" aria-label={`${label}选项`}><Ellipsis size={16} /></button></div>
                  <div className="task-list">
                    {items.map((task) => <button key={task.id} className={`task-card ${selectedTask === task.id ? 'task-selected' : ''}`} onClick={() => setSelectedTask(task.id)}>
                      <div className="task-card-top"><span className={`priority-mark ${task.priority}`} /><span>{task.project}</span><Ellipsis size={15} className="task-ellipsis" /></div>
                      <h4>{task.title}</h4>
                      {task.notes && <p className="task-note">{task.notes}</p>}
                      <div className="task-card-bottom"><span className={`due-date ${task.due === '今天' ? 'due-today' : ''}`}><Clock3 size={12} />{task.due}</span>{task.agent ? <span className={`agent-chip ${task.status}`}><Bot size={12} />{task.agent}</span> : task.owner ? <span className="owner-chip"><UserRound size={11} />{task.owner}</span> : <span className="assignee-empty">未分配</span>}</div>
                    </button>)}
                    {addingTo === id && <form className="new-task-form" onSubmit={(event) => { event.preventDefault(); addTask(id) }}><input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写下任务名称..." /><div><button type="button" className="text-button" onClick={() => setAddingTo(null)}>取消</button><button type="submit" className="mini-submit">添加</button></div></form>}
                    <button className="add-task-button" onClick={() => { setAddingTo(id); setDraft('') }}><Plus size={15} />添加任务</button>
                  </div>
                </section>
              })}
            </div>
          </section>

          <section className="activity-section">
            <div className="activity-heading"><div><h2>Agent 实时动态</h2><p>每一步都有记录，进展清楚可见</p></div><button className="text-link">查看全部<ArrowUpRight size={14} /></button></div>
            <div className="activity-panel">
              <div className="activity-live"><Radio size={15} /><span>活动流</span><span className="live-tag"><i />演示</span></div>
              <div className="activity-events">
                {events.slice(0, 3).map((event) => {
                  const EventIcon = eventIcons[event.kind]
                  const task = tasks.find((item) => item.id === event.taskId)
                  return <div className="activity-event" key={event.id}><div className={`event-icon ${event.kind}`}><EventIcon size={14} /></div><div className="event-copy"><strong>{task?.agent ?? '工作助理'} <span>{event.kind === 'start' ? '开始处理' : event.kind === 'done' ? '完成了' : event.kind === 'waiting' ? '等待确认' : '更新进度'}</span></strong><p>{event.message}{task && <><span className="event-separator">·</span><b>{task.title}</b></>}</p></div><time>{event.time}</time></div>
                })}
                {events.length === 0 && <div className="empty-events">还没有 Agent 活动。打开任务详情，试试「运行演示」查看进度流。</div>}
              </div>
            </div>
          </section>
          <footer className="page-footer"><span><Hash size={12} />本地保存 · 仅此设备可见</span><span>DAYMARK <b>0.1.0</b></span></footer>
        </div>
      </main>

      <aside className={`detail-panel ${selected ? 'detail-open' : ''}`}>
        <div className="detail-top"><span className="detail-label">任务详情</span><button className="icon-button" aria-label="关闭详情" onClick={() => setSelectedTask(null)}><X size={17} /></button></div>
        {selected ? <div className="detail-content">
          <div className="detail-project"><span className="project-dot dot-0" />{selected.project}<ChevronDown size={13} /></div>
          <h2>{selected.title}</h2>
          <div className="detail-properties">
            <div className="property-row"><span>状态</span><select value={selected.status} onChange={(event) => updateTask(selected.id, { status: event.target.value as TaskStatus })}>{columns.map((column) => <option value={column.id} key={column.id}>{statusNames[column.id]}</option>)}</select></div>
            <div className="property-row"><span>负责人</span><span className="property-value">{selected.owner ? <><UserRound size={14} />{selected.owner}</> : selected.agent ? <><span className="tiny-bot"><Bot size={12} /></span>{selected.agent}</> : <><span className="plus-circle"><Plus size={12} /></span>未分配</>}</span></div>
            <div className="property-row"><span>截止日期</span><span className="property-value"><Clock3 size={14} />{selected.due}</span></div>
            <div className="property-row"><span>优先级</span><span className={`priority-value ${selected.priority}`}><i />{selected.priority === 'high' ? '高' : selected.priority === 'low' ? '低' : '普通'}</span></div>
          </div>
          <div className="detail-divider" />
          <div className="detail-description-head"><h3>任务说明</h3><button className="icon-button" aria-label="编辑说明"><Ellipsis size={16} /></button></div>
          <p className="detail-description">{selected.notes || '添加任务说明，让你或 Agent 更清楚下一步要做什么。'}</p>
          <div className="detail-divider" />
          <div className="agent-run-head"><div><h3>Agent 执行</h3><span className="demo-label">原型演示</span></div><button className="run-button" onClick={() => runDemoAgent(selected)} disabled={running[selected.id] === 'running'}>{running[selected.id] === 'running' ? <><Activity size={13} />运行中</> : <><Play size={13} />运行演示</>}</button></div>
          <p className="agent-disclaimer">目前只演示状态变化和事件记录，不会调用 AI 或操作你的账号。</p>
          <div className="run-status"><span className={running[selected.id] === 'running' ? 'status-dot running' : 'status-dot'} />{running[selected.id] === 'running' ? '正在处理' : running[selected.id] === 'waiting' ? '等待接入真实 Agent' : 'Agent 未运行'}<span className="run-time">{running[selected.id] === 'waiting' ? '刚刚' : '—'}</span></div>
          <div className="task-timeline"><div className="timeline-line" />{taskEvents.slice(0, 4).map((event) => <div className="timeline-item" key={event.id}><div className={`timeline-dot ${event.kind}`} /> <div><strong>{event.message}</strong><span>{event.time}</span></div></div>)}{taskEvents.length === 0 && <span className="timeline-empty">运行记录会显示在这里。</span>}</div>
          <div className="detail-divider" />
          <div className="comments-head"><MessageCircle size={15} /><h3>对话与备注</h3><span>0</span></div>
          <button className="comment-composer" onClick={() => setChatOpen(true)}><span className="profile-avatar small">J</span><span>写备注，或和小助手聊聊...</span><ArrowUpRight size={14} /></button>
        </div> : <div className="no-selection"><Square size={20} /><span>选择一个任务查看详情</span></div>}
        <div className="detail-bottom"><span><span className="saved-dot" />自动保存</span><button onClick={() => selected && updateTask(selected.id, { status: 'done' })}><Check size={14} />完成任务</button></div>
      </aside>

      <button className="chat-fab" onClick={() => setChatOpen(true)}><MessageCircle size={18} /><span>和小助手聊聊</span>{selectedNotionPages.length > 0 && <span className="notion-selection-count">{selectedNotionPages.length}</span>}<Sparkles size={14} /></button>
      {chatOpen && <div className="chat-drawer">
        <div className="chat-header"><div className="chat-avatar"><Sparkles size={16} /></div><div><strong>DeepSeek 工作助理</strong><span><i className={deepSeekConfigured ? 'connected' : ''} />{deepSeekConfigured ? `已连接${selectedNotionPages.length ? ` · ${selectedNotionPages.length} 个 Notion 页面` : ''}` : '需要设置 API Key'}</span></div><button className="icon-button" onClick={() => setChatOpen(false)} aria-label="关闭聊天"><X size={17} /></button></div>
        <div className="chat-body"><div className="assistant-bubble">你好！我可以根据任务清单和你在设置中选择的 Notion 页面，帮你查找和总结工作资料。<br /><br />我只能读取已授权且已选择的页面，不会修改 Notion 内容。</div>{chatMessages.map((message, index) => <div className={message.role === 'user' ? 'user-bubble' : 'assistant-bubble'} key={index}>{message.content || (chatLoading && index === chatMessages.length - 1 ? (chatStatus || '正在思考…') : '')}</div>)}</div>
        <form className="chat-compose" onSubmit={(event) => void sendChat(event)}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder={deepSeekConfigured ? '输入消息...' : '先在设置中添加 DeepSeek API Key'} disabled={chatLoading} /><button type="submit" aria-label="发送消息" disabled={chatLoading}><ArrowUpRight size={16} /></button></form>
        <div className="chat-footnote">{selectedNotionPages.length ? `${selectedNotionPages.length} 个选中 Notion 页面的内容也会发送给 DeepSeek` : '消息与任务清单会发送给 DeepSeek API'}</div>
      </div>}
      {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
        <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="settings-modal-head"><div className="chat-avatar"><Settings2 size={16} /></div><div><h2 id="settings-title">连接设置</h2><p>凭据加密后仅保存在这台电脑</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><X size={17} /></button></div>
          <div className="integration-card">
            <div className="integration-title"><div className="integration-icon"><Sparkles size={16} /></div><div><strong>DeepSeek 助理</strong><span>{deepSeekConfigured ? 'API Key 已保存在本机' : '添加 API Key 以启用对话'}</span></div><span className={`connection-pill ${deepSeekConfigured ? 'connected' : ''}`}>{deepSeekConfigured ? '已连接' : '未连接'}</span></div>
            <form onSubmit={(event) => void saveDeepSeekKey(event)}>
              <label htmlFor="deepseek-key">DeepSeek API Key</label>
              <input id="deepseek-key" type="password" autoComplete="new-password" required value={deepSeekKey} onChange={(event) => setDeepSeekKey(event.target.value)} placeholder={deepSeekConfigured ? '已加密保存；填新 Key 可替换' : '粘贴你的 API Key'} />
              <p className="settings-hint">密钥使用 Windows 安全存储加密，不会保存在前端代码或发送到其他服务。</p>
              {!deepSeekEncryptionAvailable && <p className="settings-error">当前系统加密存储不可用，暂不能安全保存密钥。</p>}
              {deepSeekError && <p className="settings-error">{deepSeekError}</p>}
              <div className="settings-form-actions"><span>模型：deepseek-flash</span><button type="submit" className="primary-button" disabled={deepSeekSaving || !deepSeekEncryptionAvailable}>{deepSeekSaving ? '保存中…' : '安全保存'}</button></div>
            </form>
            {deepSeekConfigured && <button className="remove-key-button" onClick={() => { void window.desktop.deepseek.saveKey('').then(() => setDeepSeekConfigured(false)).catch((error: unknown) => setDeepSeekError(error instanceof Error ? error.message : '删除密钥失败。')) }}>删除本机保存的 Key</button>}
            <p className="settings-link-note">在浏览器打开 <span>platform.deepseek.com/api_keys</span> 创建 API Key。API 用量可能产生费用。</p>
          </div>
          <div className="integration-card notion-integration">
            <div className="integration-title"><div className="integration-icon"><Hash size={16} /></div><div><strong>Notion 工作区（只读）</strong><span>{notionConnectedAs ? `已连接：${notionConnectedAs}` : notionConfigured ? 'Token 已保存；请测试连接' : '创建 internal integration 并授权页面'}</span></div><span className={`connection-pill ${notionConnectedAs ? 'connected' : ''}`}>{notionConnectedAs ? '已连接' : notionConfigured ? '待测试' : '未连接'}</span></div>
            <form onSubmit={(event) => void saveNotionToken(event)}>
              <label htmlFor="notion-token">Notion Internal Integration Secret</label>
              <input id="notion-token" type="password" autoComplete="new-password" required value={notionToken} onChange={(event) => setNotionToken(event.target.value)} placeholder={notionConfigured ? '已加密保存；填新 token 可替换' : '粘贴 Internal Integration Secret'} />
              <p className="settings-hint">密钥在本机加密保存。先在 Notion 创建 integration，并启用 Read content 权限。</p>
              {!notionEncryptionAvailable && <p className="settings-error">当前系统加密存储不可用，暂不能安全保存 token。</p>}
              {notionError && <p className="settings-error">{notionError}</p>}
              <div className="notion-actions"><button type="submit" className="primary-button" disabled={notionSaving || !notionEncryptionAvailable}>{notionSaving ? '保存中…' : '安全保存'}</button><button type="button" className="notion-test-button" onClick={() => void testNotionConnection()} disabled={!notionConfigured || notionTesting}>{notionTesting ? '测试中…' : '测试连接'}</button><a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">打开 Notion 集成设置 ↗</a></div>
            </form>
            {notionConfigured && <button className="remove-key-button" onClick={() => { void window.desktop.notion.saveToken('').then(() => { setNotionConfigured(false); setNotionConnectedAs(''); setNotionResults([]); setSelectedNotionPages([]); localStorage.removeItem('daymark.notionPages') }).catch((error: unknown) => setNotionError(error instanceof Error ? error.message : '删除 Notion token 失败。')) }}>删除本机保存的 Notion token</button>}
            <div className="notion-search"><label htmlFor="notion-search">按标题搜索已授权页面（留空列出可见页面）</label><form onSubmit={(event) => { event.preventDefault(); void searchNotion() }}><input id="notion-search" value={notionQuery} onChange={(event) => setNotionQuery(event.target.value)} placeholder="页面标题关键词，可留空" disabled={!notionConfigured} /><button type="submit" disabled={!notionConfigured || notionSearching}>{notionSearching ? '搜索中…' : '搜索'}</button></form>
              <form className="notion-direct-page" onSubmit={(event) => void addNotionPage(event)}><input value={notionPageLink} onChange={(event) => setNotionPageLink(event.target.value)} placeholder="或粘贴 Notion 页面完整链接" disabled={!notionConfigured || notionAddingPage} /><button type="submit" disabled={!notionConfigured || notionAddingPage || !notionPageLink.trim()}>{notionAddingPage ? '读取中…' : '添加链接'}</button></form>
              {notionError && <p className="settings-error">{notionError}</p>}
              {notionSearchInfo && <p className="settings-hint">{notionSearchInfo}</p>}
              <div className="selected-notion-list">{selectedNotionPages.map((page) => <div className="selected-notion-page" key={page.id}><span>{page.title}</span><button type="button" onClick={() => toggleNotionPage(page)}>移除</button></div>)}</div>
              {notionResults.length > 0 && <div className="notion-results">{notionResults.map((page) => <label className="notion-result" key={page.id}><input type="checkbox" checked={selectedNotionPages.some((item) => item.id === page.id)} disabled={!selectedNotionPages.some((item) => item.id === page.id) && selectedNotionPages.length >= 5} onChange={() => toggleNotionPage(page)} /><span><strong>{page.title}</strong><small>{page.lastEditedTime ? `更新于 ${new Date(page.lastEditedTime).toLocaleDateString()}` : 'Notion 页面'}</small></span></label>)}</div>}
              <p className="settings-hint">最多选择 5 个页面。聊天时只读取这些页面；请在 Notion 页面菜单 → Add connections 中把页面分享给 integration。</p>
            </div>
          </div>
          <div className="settings-footer">所选 Notion 页面内容会发送给 DeepSeek 生成回答；应用只读，不会写回 Notion。</div>
        </section>
      </div>}
    </div>
  )
}

export default App
