import networkx as nx
import matplotlib.pyplot as plt

class TimetableGraph:
    def __init__(self):
        self.graph = nx.DiGraph()

    def add_event(self, event_id, event_name, actions=None):
        if actions is None:
            actions = {}
        self.graph.add_node(event_id, type='event', name=event_name, actions=actions)

    def add_resource(self, resource_id, resource_type, resource_name, actions=None):
        if actions is None:
            actions = {}
        self.graph.add_node(resource_id, type=resource_type, name=resource_name, actions=actions)

    def add_constraint(self, event_id, resource_id, constraint_type):
        self.graph.add_edge(event_id, resource_id, type=constraint_type)

    def set_strategy(self, player_id, strategy):
        self.graph.nodes[player_id]['strategy'] = strategy

    def set_payoff(self, player_id, payoff):
        self.graph.nodes[player_id]['payoff'] = payoff

    def set_constraint(self, player_id, constraint):
        self.graph.nodes[player_id]['constraint'] = constraint

    def display(self):
        nx.draw(self.graph, with_labels=True, node_color='skyblue', node_size=1500, font_size=10)
        plt.show()
