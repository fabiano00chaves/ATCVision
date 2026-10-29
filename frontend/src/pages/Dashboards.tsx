import React, { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dashboardsApi, occurrencesApi } from '@/api'
import type {
  BadActorItem,
  FailureModes,
  Kpis,
  OccurrenceFilters,
  OccurrenceSummary,
  Paginated,
} from '@/api/types'
import { FilterSidebar } from '@/components/filters/FilterSidebar'
import { QuickbarPresets } from '@/components/filters/QuickbarPresets'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity,
  AlertTriangle,
  Clock,
  Layers,
  Loader2,
  OctagonAlert,
  ShieldAlert,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

const COLORS = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#eab308', '#ef4444', '#06b6d4']

export function Dashboards() {
  const [filters, setFilters] = useState<OccurrenceFilters>({})
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [badActors, setBadActors] = useState<BadActorItem[]>([])
  const [badActorDays, setBadActorDays] = useState<number>(7)
  const [failureModes, setFailureModes] = useState<FailureModes | null>(null)
  const [jumpsData, setJumpsData] = useState<Paginated<OccurrenceSummary> | null>(null)
  const [jumpFilter, setJumpFilter] = useState<'ALL' | 'PENDENTE' | 'RETIRADO'>('PENDENTE')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [kRes, baRes, fmRes, jRes] = await Promise.all([
        dashboardsApi.kpis(filters),
        dashboardsApi.badActors(filters, badActorDays, 2),
        dashboardsApi.failureModes(filters),
        dashboardsApi.jumps(filters, jumpFilter),
      ])
      setKpis(kRes)
      setBadActors(baRes.items)
      setFailureModes(fmRes)
      setJumpsData(jRes)
    } catch {
      toast.error('Erro ao carregar dados de confiabilidade')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [filters, badActorDays, jumpFilter])

  const handleToggleJumpStatus = async (item: OccurrenceSummary) => {
    const next = item.jump_status === 'RETIRADO' ? 'PENDENTE' : 'RETIRADO'
    try {
      await occurrencesApi.patch(item.id, { jump_status: next })
      toast.success(`Jump atualizado para ${next}`)
      loadData()
    } catch {
      toast.error('Erro ao atualizar status do Jump')
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <FilterSidebar filters={filters} onChange={setFilters} />

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <QuickbarPresets filters={filters} onChange={setFilters} totalCount={kpis?.total} />

        <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-7xl mx-auto w-full">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
                <Activity className="size-3.5 text-primary" /> Ocorrências Totais
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold font-mono text-foreground">{kpis?.total ?? '-'}</p>
              <div className="flex gap-2 text-[10px] text-muted-foreground mt-1">
                <span>Corr: {kpis?.by_tipo.find((t) => t.tipo === 'CORRETIVA')?.count || 0}</span>
                <span>Notif: {kpis?.by_tipo.find((t) => t.tipo === 'NOTIFICACAO_GERAL')?.count || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-[11px] font-medium flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <OctagonAlert className="size-3.5" /> Indisponibilidade / Panes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
                {kpis ? `${Math.round(kpis.pane_total_min)}m` : '-'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {kpis?.pane_count || 0} evento(s) de parada
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-[11px] font-medium flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5" /> Jumps / Forces
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {kpis?.jump_pendentes ?? '-'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {kpis?.jump_count || 0} registrado(s) no total
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-[11px] font-medium flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <Clock className="size-3.5" /> MTTR Médio
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold font-mono text-foreground">
                {kpis?.mttr_min ? `${Math.round(kpis.mttr_min)} min` : '-'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Tempo Médio para Reparo</p>
            </CardContent>
          </Card>

          <Card className="shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
                <Users className="size-3.5 text-primary" /> Horas Homem (HH)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold font-mono text-foreground">
                {kpis ? `${(kpis.hh_total_min / 60).toFixed(1)}h` : '-'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{kpis?.hh_total_min || 0} min apontados</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Daily Evolution Chart */}
          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-primary" /> Evolução Diária de Ocorrências e Panes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis?.by_day || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="CORRETIVA" name="Corretivas" fill="#ef4444" stackId="a" />
                  <Bar dataKey="NOTIFICACAO_GERAL" name="Notif. Geral" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="PREVENTIVA_CONDICAO" name="Prev. Condicional" fill="#10b981" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Árvore de Planta Breakdown */}
          <Card className="shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <Layers className="size-3.5 text-primary" /> Ocorrências por Linha / Árvore de Planta
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis?.by_arvore || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="arvore" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Bar dataKey="count" name="Qtd Ocorrências" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Operational Risk: Jumps & Forces Monitor */}
        <Card className="shadow-2xs">
          <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" /> Monitor de Risco Operacional: Jumps e By-passes Ativos
              </CardTitle>
              <CardDescription className="text-[11px]">
                Controle de forças provisórias em PLC, jumpeamento de bornes e setpoints modificados
              </CardDescription>
            </div>
            <div className="flex gap-1 shrink-0">
              {(['PENDENTE', 'RETIRADO', 'ALL'] as const).map((st) => (
                <Button
                  key={st}
                  size="xs"
                  variant={jumpFilter === st ? 'default' : 'outline'}
                  onClick={() => setJumpFilter(st)}
                  className="h-6 text-[10px]"
                >
                  {st === 'ALL' ? 'Todos' : st === 'PENDENTE' ? 'Pendentes' : 'Retirados'}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground text-[11px]">
                    <th className="py-2">Posição Funcional</th>
                    <th className="py-2">Título / Ordem</th>
                    <th className="py-2">Detalhes do Jump</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {jumpsData?.items.map((j) => (
                    <tr key={j.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="py-2 font-mono font-bold text-primary">{j.posicao_funcional || '-'}</td>
                      <td className="py-2">
                        <p className="font-semibold">{j.titulo}</p>
                        <p className="text-[10px] text-muted-foreground">Ord: {j.numero_ordem || '-'}</p>
                      </td>
                      <td className="py-2 text-foreground max-w-xs">{j.detalhe_jump_tarefas || '-'}</td>
                      <td className="py-2">
                        <Badge variant={j.jump_status === 'RETIRADO' ? 'secondary' : 'jump'}>
                          {j.jump_status || 'PENDENTE'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleToggleJumpStatus(j)}
                          className="h-6 text-[10px]"
                        >
                          {j.jump_status === 'RETIRADO' ? 'Reabrir' : 'Dar Baixa'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {jumpsData?.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted-foreground text-[11px] italic">
                        Nenhum jump ou force registrado com este status.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bad Actors Ranking */}
        <Card className="shadow-2xs">
          <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <ShieldAlert className="size-4 shrink-0" /> Análise de "Bad Actors" (Ativos Críticos e Reincidência)
              </CardTitle>
              <CardDescription className="text-[11px]">
                Posições funcionais com 2 ou mais falhas recorrentes no período selecionado
              </CardDescription>
            </div>
            <div className="flex gap-1 shrink-0">
              {[7, 15, 30].map((d) => (
                <Button
                  key={d}
                  size="xs"
                  variant={badActorDays === d ? 'default' : 'outline'}
                  onClick={() => setBadActorDays(d)}
                  className="h-6 text-[10px]"
                >
                  {d} dias
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {badActors.map((ba, idx) => (
                <div key={idx} className="border rounded-md p-2.5 text-xs bg-card space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-600 dark:text-red-400">#{idx + 1}</span>
                      <span className="font-mono font-bold text-foreground">{ba.posicao_funcional}</span>
                      <Badge variant="outline">{ba.arvore || 'Geral'}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground">{ba.count} falhas</span>
                      {ba.pane_min > 0 && (
                        <Badge variant="pane">{Math.round(ba.pane_min)} min de pane</Badge>
                      )}
                    </div>
                  </div>
                  {ba.descricao && (
                    <p className="text-[11px] text-muted-foreground">{ba.descricao}</p>
                  )}
                  <div className="pt-1 border-t border-border/30 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {ba.occurrences.map((occ) => (
                      <span key={occ.id} className="bg-muted px-1.5 py-0.5 rounded">
                        • {occ.titulo.slice(0, 35)}...
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {badActors.length === 0 && (
                <p className="text-center text-muted-foreground py-4 text-[11px] italic">
                  Nenhum ativo apresentou reincidência de falhas nos últimos {badActorDays} dias.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Failure Modes & SAP Quality Alert */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 shadow-2xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <Wrench className="size-3.5 text-primary" /> Modos de Falha Recorrentes (Defeito × Causa)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground text-[11px]">
                      <th className="py-1.5">Defeito</th>
                      <th className="py-1.5">Causa Raiz</th>
                      <th className="py-1.5 text-right">Ocorrências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failureModes?.matrix.map((m, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1.5 font-medium">{m.defeito}</td>
                        <td className="py-1.5 text-muted-foreground">{m.causa}</td>
                        <td className="py-1.5 text-right font-bold text-primary">{m.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* SAP Filling Quality Alert Card */}
          <Card className="shadow-2xs border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4" /> Qualidade do Preenchimento SAP PM
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3 text-xs">
              <div className="text-center p-3 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800">
                <p className="text-2xl font-bold font-mono text-amber-800 dark:text-amber-300">
                  {failureModes?.quality.pct_baixa_qualidade ?? 0}%
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                  Taxa de notas sem causa raiz ou com diagnóstico incompleto
                </p>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">"Causa raiz não encontrada":</span>
                  <span className="font-bold">{failureModes?.quality.causa_nao_encontrada || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">"Análise de causa não realizada":</span>
                  <span className="font-bold">{failureModes?.quality.analise_nao_realizada || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notas sem campo Causa preenchido:</span>
                  <span className="font-bold">{failureModes?.quality.sem_causa || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
  )
}
