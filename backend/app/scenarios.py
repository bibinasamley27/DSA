PRESETS = ('zero_demand', 'balanced', 'east_surge', 'fairness_trap', 'oscillation')

def probabilities(scenario, tick):
    if scenario not in PRESETS:
        raise ValueError('unknown scenario')
    if scenario == 'zero_demand':
        return (0, 0, 0, 0)
    if scenario == 'east_surge':
        return (.15, .95, .15, .15)
    if scenario == 'fairness_trap':
        return (.85, .85, .85, .1)
    if scenario == 'oscillation':
        if tick % 44 < 20:
            return (0, 0, 0, 0)
        return (.8, .1, .8, .1) if (tick // 44) % 2 else (.1, .8, .1, .8)
    return (.3, .3, .3, .3)
