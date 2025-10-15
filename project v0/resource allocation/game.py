import networkx as nx
import matplotlib.pyplot as plt
import random

# Create an empty graph
G = nx.Graph()

# Add nodes representing resources (e.g., servers)
G.add_node('Server1', resources=10)
G.add_node('Server2', resources=15)
G.add_node('Server3', resources=12)

# Add edges representing connections between servers
G.add_edge('Server1', 'Server2', capacity=100)
G.add_edge('Server1', 'Server3', capacity=80)
G.add_edge('Server2', 'Server3', capacity=90)

# Visualize the network
pos = nx.spring_layout(G)  # Positions for all nodes

# Draw nodes
nx.draw_networkx_nodes(G, pos, node_size=700)

# Draw edges
nx.draw_networkx_edges(G, pos, width=2)

# Draw labels
nx.draw_networkx_labels(G, pos, font_size=12, font_family='sans-serif')

# Draw edge labels
labels = nx.get_edge_attributes(G, 'capacity')
nx.draw_networkx_edge_labels(G, pos, edge_labels=labels)

# Display the plot
plt.title("Network Topology")
plt.axis('off')  # Turn off axis
plt.show()


class Player:
    def __init__(self, name, strategy,node=None, utility=0):
        self.name = name
        self.strategy = strategy
        self.node = None
        self.utility = 0

    def select_resource(self, available_resources, network_topology):
        if self.strategy == 'greedy':
            return self.greedy_strategy(available_resources)
        elif self.strategy == 'shortest_path':
            return self.shortest_path_strategy(available_resources, network_topology)
        elif self.strategy == 'random':
            return self.random_strategy(available_resources)
        else:
            raise ValueError("Invalid strategy")

    def greedy_strategy(self, available_resources):
        # Select resource with highest capacity
        return max(available_resources, key=lambda x: x['capacity'])

    def shortest_path_strategy(self, available_resources, network_topology):
        # Select resource with shortest path
        # (For simplicity, this example assumes all resources are directly reachable)
        return min(available_resources, key=lambda x: network_topology.degree(x['node']))

    def random_strategy(self, available_resources):
        # Select resource randomly
        return random.choice(available_resources)
    
class Resource:
    def __init__(self, node, capacity, quality, availability, cost, reliability):
        self.node = node  # Node representing the resource in the network topology
        self.capacity = capacity  # Maximum amount of resource that can be allocated
        self.quality = quality  # Level of service or performance
        self.availability = availability  # Probability that the resource is available
        self.cost = cost  # Cost associated with accessing or using the resource
        self.reliability = reliability  # Reliability or uptime of the resource

# Create resources
resource1 = Resource(node='Server1', capacity=100, quality='High', availability=0.9, cost=10, reliability=0.95)
resource2 = Resource(node='Server2', capacity=150, quality='Medium', availability=0.8, cost=15, reliability=0.90)
resource3 = Resource(node='Server3', capacity=120, quality='Low', availability=0.7, cost=20, reliability=0.85)


# Define network topology
network_topology = nx.Graph()
network_topology.add_node('Server1', resources=[resource1])
network_topology.add_node('Server2', resources=[resource2])
network_topology.add_node('Server3', resources=[resource3])
network_topology.add_edge('Server1', 'Server2', capacity=100)
network_topology.add_edge('Server1', 'Server3', capacity=80)
network_topology.add_edge('Server2', 'Server3', capacity=90)

# Create players with different strategies
player1 = Player(name='Alice', strategy='greedy')
player2 = Player(name='Bob', strategy='shortest_path')
player3 = Player(name='Charlie', strategy='random')

# Allocate resources to players
players = [player1, player2, player3]
for player in players:
    available_resources = network_topology.nodes[player.node]['resources']
    selected_resource = player.select_resource(available_resources, network_topology)
    player.node = selected_resource['node']
    player.utility = selected_resource['quality']
    print(f"{player.name} allocated to {player.node} with utility {player.utility}")

# Visualize the network with player allocations
pos = nx.spring_layout(network_topology)  # Positions for all nodes

# Draw nodes
nx.draw_networkx_nodes(network_topology, pos, node_size=700)

# Draw edges
nx.draw_networkx_edges(network_topology, pos, width=2)

# Draw labels
nx.draw_networkx_labels(network_topology, pos, font_size=12, font_family='sans-serif')

# Draw edge labels
labels = nx.get_edge_attributes(network_topology, 'capacity')
nx.draw_networkx_edge_labels(network_topology, pos, edge_labels=labels)

# Highlight player allocations
for player in players:
    nx.draw_networkx_nodes(network_topology, pos, nodelist=[player.node], node_color='r', node_size=700)

# Display the plot
plt.title("Network Topology with Player Allocations")
plt.axis('off')  # Turn off axis
plt.show()

#defining the game

class Game:
    def __init__(self, players, network_topology):
        self.players = players
        self.network_topology = network_topology

    def play(self):
        for player in self.players:
            available_resources = self.network_topology.nodes[player.node]['resources']
            selected_resource = player.select_resource(available_resources, self.network_topology)
            player.node = selected_resource['node']
            player.utility = selected_resource['quality']

    def calculate_metrics(self):
        total_utility = sum(player.utility for player in self.players)
        total_cost = sum(self.network_topology.nodes[player.node]['resources'][0].cost for player in self.players)
        total_reliability = min(self.network_topology.nodes[player.node]['resources'][0].reliability for player in self.players)
        total_availability = min(self.network_topology.nodes[player.node]['resources'][0].availability for player in self.players)
        total_capacity = sum(self.network_topology.nodes[player.node]['resources'][0].capacity for player in self.players)
        total_quality = sum(self.network_topology.nodes[player.node]['resources'][0].quality for player in self.players)

        return total_utility, total_cost, total_reliability, total_availability, total_capacity, total_quality
    
# Create a new game instance
game = Game(players, network_topology)

# Play the game
game.play()

# Calculate metrics after playing the game
total_utility, total_cost, total_reliability, total_availability, total_capacity, total_quality = game.calculate_metrics()

# Display the results
print(f"Total utility of all players: {total_utility}")
print(f"Total cost of all players: {total_cost}")
print(f"Total reliability of all players: {total_reliability}")
print(f"Total availability of all players: {total_availability}")
print(f"Total capacity of all players: {total_capacity}")
print(f"Total quality of all players: {total_quality}")

# Visualize the network with updated player allocations
pos = nx.spring_layout(network_topology)  # Positions for all nodes

# Draw nodes
nx.draw_networkx_nodes(network_topology, pos, node_size=700)

# Draw edges
nx.draw_networkx_edges(network_topology, pos, width=2)

# Draw labels
nx.draw_networkx_labels(network_topology, pos, font_size=12, font_family='sans-serif')

# Draw edge labels
labels = nx.get_edge_attributes(network_topology, 'capacity')
nx.draw_networkx_edge_labels(network_topology, pos, edge_labels=labels)

# Highlight player allocations
for player in players:
    nx.draw_networkx_nodes(network_topology, pos, nodelist=[player.node], node_color='r', node_size=700)

# Display the plot
plt.title("Network Topology with Updated Player Allocations")
plt.axis('off')  # Turn off axis
plt.show()