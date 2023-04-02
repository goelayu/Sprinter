import argparse

def print_rate(args):
  file = args.source
  intr = args.interval
  with open(file) as f:
    content = f.readlines()
    
  counter = 0
  prev = 0
  for c in content:
    counter += 1
    if counter % intr == 0:
      time, pages = c.split()
      pages = int(pages) - prev
      print(time,pages/intr)
      prev = int(c.split()[1])
      


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=str, required=True)
    parser.add_argument('--interval', type=int, default=10')
    args = parser.parse_args()

    print_rate(args)