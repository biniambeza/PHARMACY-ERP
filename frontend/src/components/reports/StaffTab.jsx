import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Clock, Download } from 'lucide-react';
import { getSalesByStaff, getSalesByShift } from '../../api/reportApi';
import { formatDateTime } from '../../utils/format';
import { exportCSV } from '../../utils/export';
import { card, btn, money, useReport, EN } from './reportUtils';
import { CardTitle, Empty, ErrorBox, Loading, DataTableSimple } from './ReportUi';

const StaffTab = ({ range, rangeKey, onExportSpec }) => {
  const { t } = useTranslation('reports');
  const staff = useReport(() => getSalesByStaff(range), rangeKey);
  const shifts = useReport(() => getSalesByShift(range), rangeKey);

  const staffColumns = useMemo(
    () => [
      { key: 'name', header: t('cols.staffMember') },
      { key: 'orders', header: t('cols.sales'), align: 'right' },
      { key: 'revenue', header: t('cols.revenue'), align: 'right', format: money },
      { key: 'refunds', header: t('cols.refunds'), align: 'right', format: money },
      { key: 'netRevenue', header: t('cols.net'), align: 'right', format: money },
      { key: 'discount', header: t('cols.discounts'), align: 'right', format: money },
      { key: 'avgTicket', header: t('cols.avgTicket'), align: 'right', format: money },
    ],
    [t]
  );

  const shiftColumns = useMemo(
    () => [
      { key: 'label', header: t('cols.shift') },
      { key: 'staff', header: t('cols.staff'), format: (v) => (v || []).join(', ') },
      { key: 'openedAt', header: t('cols.opened'), format: (v) => formatDateTime(v) },
      { key: 'closedAt', header: t('cols.closed'), format: (v) => (v ? formatDateTime(v) : '—') },
      { key: 'orders', header: t('cols.sales'), align: 'right' },
      { key: 'netRevenue', header: t('cols.netRevenue'), align: 'right', format: money },
      { key: 'variance', header: t('cols.cashVariance'), align: 'right', format: (v) => (v === null || v === undefined ? '—' : money(v)) },
    ],
    [t]
  );

  useEffect(() => {
    if (!staff.data) return;
    onExportSpec({
      title: t('staff.byStaff'),
      fileTitle: t('staff.byStaff', EN),
      columns: staffColumns,
      rows: staff.data.report.rows,
    });
  }, [staff.data, staffColumns, onExportSpec, t]);

  if (staff.loading && !staff.data) return <Loading />;
  if (staff.error) return <ErrorBox message={staff.error} onRetry={staff.reload} />;

  return (
    <div className="space-y-6">
      <div className={card}>
        <CardTitle icon={Users} title={t('staff.byStaff')} subtitle={t('staff.byStaffSub')} />
        <DataTableSimple columns={staffColumns} rows={staff.data?.report.rows || []} />
      </div>
      <div className={card}>
        <CardTitle
          icon={Clock}
          tone="indigo"
          title={t('staff.byShift')}
          subtitle={t('staff.byShiftSub')}
          right={
            shifts.data?.report.rows?.length ? (
              <button className={btn} onClick={() => exportCSV(shifts.data.report.rows, shiftColumns, 'sales-by-shift')}>
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            ) : null
          }
        />
        {shifts.error ? <Empty>{shifts.error}</Empty> : <DataTableSimple columns={shiftColumns} rows={shifts.data?.report.rows || []} />}
      </div>
    </div>
  );
};

export default StaffTab;
