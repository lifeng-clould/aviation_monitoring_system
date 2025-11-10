使用 streamlit run main.py
【系统架构】
1. 数据模型层 (src/models/)
   - Flight: 航班信息类
   - Task: 保障任务类
   - AircraftADSB: 飞机轨迹类
   - VehicleGPS: 车辆GPS类

2. 数据处理层 (src/)
   - DataLoader: 数据加载器
   - DataMatcher: 数据匹配器（实现三大匹配任务）
   - Visualizer: 可视化工具

3. 区块链层 (src/blockchain_platform.py)
   - Block: 区块类
   - DataChannel: 六大数据通道
   - SmartContract: 智能合约
   - Node: 联盟链节点
   - BlockchainPlatform: 核心平台

【快速开始】
1. 安装依赖:
   pip install -r requirements.txt

2. 准备数据:
   将CSV文件放入 data/ 目录

3. 运行程序:
   python main.py

【高级用法】
1. 单独使用数据加载器:
   from src.data_loader import DataLoader
   loader = DataLoader()
   flights = loader.load_flights()

2. 自定义匹配参数:
   matcher = DataMatcher(loader)
   matcher.match_flight_adsb(time_window=60)  # 扩大时间窗口

3. 生成特定可视化:
   visualizer = Visualizer(matcher)
   visualizer.plot_aircraft_trajectories(fuuid="MU5314-2025-09-14-A")

4. 区块链平台扩展:
   platform = BlockchainPlatform()
   # 添加自定义智能合约
   platform.contracts["custom"] = SmartContract("自定义合约", {...})

【输出文件】
- output/figures/statistics.png: 统计分析图表
- output/figures/aircraft_trajectory.png: 飞机滑行轨迹
- output/figures/vehicle_trajectory.png: 牵引车行驶轨迹

【注意事项】
1. CSV文件必须包含文档中描述的所有字段
2. 时间格式应为 'YYYY/MM/DD HH:MM'
3. 坐标系统使用WGS84（GPS坐标）
4. 建议使用Jupyter Notebook进行交互式分析

================================================================================
"""
