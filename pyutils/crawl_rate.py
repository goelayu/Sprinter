import argparse

def print_rate(args):
  file = args.source
  with open(file) as f:
    content = f.readlines()
    
  counter = 0
  prev = 0
  for c in content:
    counter += 1
    if counter % 5 == 0:
      time, pages = c.split()
      pages = int(pages) - prev
      print(time,pages/5)
      prev = int(c.split()[1])
      


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=str, required=True)
    args = parser.parse_args()

    print_rate(args)