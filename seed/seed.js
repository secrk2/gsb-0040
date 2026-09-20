'use strict';

// 初始数据：1 位楼长（管理员）+ 15 户邻居，24 件共享工具
// 演示账号不做注册，直接用 用户名/密码 登录（密码均为 123456，楼长为 admin123）

const SEED_USERS = [
  {
    id: 'u0',
    username: 'louzhang',
    password: 'admin123',
    name: '周慧敏（楼长）',
    role: 'admin',
    building: '3',
    room: '502',
    phone: '13800000001',
  },
  { id: 'u1', username: 'liming', password: '123456', name: '李明', role: 'neighbor', building: '1', room: '101', phone: '13911110101' },
  { id: 'u2', username: 'wangfang', password: '123456', name: '王芳', role: 'neighbor', building: '1', room: '203', phone: '13722220202' },
  { id: 'u3', username: 'zhangwei', password: '123456', name: '张伟', role: 'neighbor', building: '1', room: '302', phone: '13633330303' },
  { id: 'u4', username: 'liuyang', password: '123456', name: '刘洋', role: 'neighbor', building: '1', room: '501', phone: '13544440404' },
  { id: 'u5', username: 'chenjing', password: '123456', name: '陈静', role: 'neighbor', building: '2', room: '102', phone: '13455550505' },
  { id: 'u6', username: 'yangjie', password: '123456', name: '杨杰', role: 'neighbor', building: '2', room: '201', phone: '15866660606' },
  { id: 'u7', username: 'zhaolei', password: '123456', name: '赵磊', role: 'neighbor', building: '2', room: '303', phone: '15977770707' },
  { id: 'u8', username: 'huangmin', password: '123456', name: '黄敏', role: 'neighbor', building: '2', room: '402', phone: '18688880808' },
  { id: 'u9', username: 'zhoutao', password: '123456', name: '周涛', role: 'neighbor', building: '2', room: '601', phone: '18799990909' },
  { id: 'u10', username: 'wuxia', password: '123456', name: '吴霞', role: 'neighbor', building: '3', room: '101', phone: '13310101010' },
  { id: 'u11', username: 'xubin', password: '123456', name: '徐斌', role: 'neighbor', building: '3', room: '202', phone: '15520202020' },
  { id: 'u12', username: 'sunli', password: '123456', name: '孙丽', role: 'neighbor', building: '3', room: '303', phone: '18830303030' },
  { id: 'u13', username: 'maguang', password: '123456', name: '马广', role: 'neighbor', building: '3', room: '401', phone: '17740404040' },
  { id: 'u14', username: 'zhuling', password: '123456', name: '朱琳', role: 'neighbor', building: '3', room: '602', phone: '13050505050' },
  { id: 'u15', username: 'hujun', password: '123456', name: '胡军', role: 'neighbor', building: '1', room: '402', phone: '13260606060' },
];

// 24 件工具：覆盖全部品类 / 安全等级 / 状态
const SEED_TOOLS = [
  {
    id: 'T001', name: '博世冲击钻', category: '电动工具', deposit: 200,
    availableTime: '工作日 19:00–21:30；周末全天', safetyLevel: 'instruction',
    safetyNote: '使用前确认钻头夹紧、墙面无暗埋电线水管；务必佩戴护目镜，禁止戴手套操作旋转部件；归还时清理夹头灰尘。',
    status: 'available', ownerId: 'u1', createdAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'T002', name: '手电钻（锂电）', category: '电动工具', deposit: 120,
    availableTime: '每天 18:00 后', safetyLevel: 'normal', safetyNote: '',
    status: 'lent', ownerId: 'u2', createdAt: '2026-08-02T09:00:00.000Z',
  },
  {
    id: 'T003', name: '角磨机', category: '电动工具', deposit: 150,
    availableTime: '周末 9:00–17:00（避免扰民时段）', safetyLevel: 'instruction',
    safetyNote: '砂轮片有裂纹严禁使用；切割方向禁止对人；必须双手握持并戴护目镜，连续工作不超过 15 分钟。',
    status: 'available', ownerId: 'u3', createdAt: '2026-08-03T09:00:00.000Z',
  },
  {
    id: 'T004', name: '电动螺丝刀套装', category: '电动工具', deposit: 60,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u4', createdAt: '2026-08-04T09:00:00.000Z',
  },
  {
    id: 'T005', name: '曲线锯', category: '电动工具', deposit: 100,
    availableTime: '周末白天', safetyLevel: 'instruction',
    safetyNote: '锯条安装后先空转检查；工件必须夹紧固定，手部远离锯切线 10cm 以上。',
    status: 'reserved', ownerId: 'u6', createdAt: '2026-08-05T09:00:00.000Z',
  },
  {
    id: 'T006', name: '电锤', category: '电动工具', deposit: 260,
    availableTime: '周末 10:00–17:00', safetyLevel: 'instruction',
    safetyNote: '仅用于混凝土钻孔；钻孔前使用金属探测仪确认墙内无管线；操作时双脚站稳、双手紧握。',
    status: 'repairing', ownerId: 'u7', createdAt: '2026-08-06T09:00:00.000Z',
  },
  {
    id: 'T007', name: '热熔胶枪', category: '电动工具', deposit: 30,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u10', createdAt: '2026-08-07T09:00:00.000Z',
  },
  {
    id: 'T008', name: '家用工具箱（38 件）', category: '手动工具', deposit: 80,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u1', createdAt: '2026-08-08T09:00:00.000Z',
  },
  {
    id: 'T009', name: '活动扳手三件套', category: '手动工具', deposit: 40,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u5', createdAt: '2026-08-09T09:00:00.000Z',
  },
  {
    id: 'T010', name: '管钳（14 寸）', category: '手动工具', deposit: 45,
    availableTime: '工作日晚 / 周末', safetyLevel: 'normal', safetyNote: '',
    status: 'lent', ownerId: 'u8', createdAt: '2026-08-10T09:00:00.000Z',
  },
  {
    id: 'T011', name: '玻璃胶枪', category: '手动工具', deposit: 15,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u11', createdAt: '2026-08-11T09:00:00.000Z',
  },
  {
    id: 'T012', name: '人字梯（2 米）', category: '梯具', deposit: 90,
    availableTime: '随时可借', safetyLevel: 'instruction',
    safetyNote: '展开后确认两侧锁扣到位；禁止站最上两级；地面湿滑或单人无法扶持时不得使用。',
    status: 'available', ownerId: 'u9', createdAt: '2026-08-12T09:00:00.000Z',
  },
  {
    id: 'T013', name: '伸缩梯（3.8 米）', category: '梯具', deposit: 180,
    availableTime: '周末白天，建议两人操作', safetyLevel: 'instruction',
    safetyNote: '靠墙使用时倾角约 75°，上端须超出支撑点 60cm；上下梯三点接触，禁止手持物品攀爬。',
    status: 'reserved', ownerId: 'u12', createdAt: '2026-08-13T09:00:00.000Z',
  },
  {
    id: 'T014', name: '五步折叠梯', category: '梯具', deposit: 70,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'offline', ownerId: 'u13', createdAt: '2026-08-14T09:00:00.000Z',
  },
  {
    id: 'T015', name: '激光测距仪（50m）', category: '测量工具', deposit: 100,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u2', createdAt: '2026-08-15T09:00:00.000Z',
  },
  {
    id: 'T016', name: '数显游标卡尺', category: '测量工具', deposit: 50,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u14', createdAt: '2026-08-16T09:00:00.000Z',
  },
  {
    id: 'T017', name: '水平尺（600mm）', category: '测量工具', deposit: 25,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u6', createdAt: '2026-08-17T09:00:00.000Z',
  },
  {
    id: 'T018', name: '墙体金属探测仪', category: '测量工具', deposit: 55,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'lent', ownerId: 'u3', createdAt: '2026-08-18T09:00:00.000Z',
  },
  {
    id: 'T019', name: '高压清洗机', category: '清洁设备', deposit: 160,
    availableTime: '周末 9:00–18:00', safetyLevel: 'instruction',
    safetyNote: '严禁对人、电器插座或车辆内饰喷射；使用带漏电保护的插座，接线板须防水；先试低压再调压。',
    status: 'available', ownerId: 'u7', createdAt: '2026-08-19T09:00:00.000Z',
  },
  {
    id: 'T020', name: '无线吸尘器（车载/家用）', category: '清洁设备', deposit: 90,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u10', createdAt: '2026-08-20T09:00:00.000Z',
  },
  {
    id: 'T021', name: '蒸汽拖把', category: '清洁设备', deposit: 70,
    availableTime: '工作日白天', safetyLevel: 'normal', safetyNote: '',
    status: 'repairing', ownerId: 'u15', createdAt: '2026-08-21T09:00:00.000Z',
  },
  {
    id: 'T022', name: '充电式绿篱机', category: '园艺工具', deposit: 130,
    availableTime: '周末白天', safetyLevel: 'instruction',
    safetyNote: '双手握持副把手，刀口朝向远离身体方向；清除枝条中的铁丝硬物后方可启动；儿童远离 10 米。',
    status: 'available', ownerId: 'u11', createdAt: '2026-08-22T09:00:00.000Z',
  },
  {
    id: 'T023', name: '园艺修枝剪组', category: '园艺工具', deposit: 35,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'offline', ownerId: 'u12', createdAt: '2026-08-23T09:00:00.000Z',
  },
  {
    id: 'T024', name: '折叠搬运手推车', category: '五金搬运', deposit: 60,
    availableTime: '随时可借', safetyLevel: 'normal', safetyNote: '',
    status: 'available', ownerId: 'u4', createdAt: '2026-08-24T09:00:00.000Z',
  },
];

module.exports = { SEED_USERS, SEED_TOOLS };
